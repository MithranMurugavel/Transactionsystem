require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const { parse } = require('csv-parse/sync');
const { parseISO, differenceInDays, format, addDays, subDays } = require('date-fns');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// MySQL Pool Connection Manager
const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    dateStrings: true // Instructs driver to parse DATE column as plain strings ('YYYY-MM-DD')
});

// Helper: Formats a Date object cleanly into database standard structure
const formatDate = (dateObj) => format(dateObj, 'yyyy-MM-dd');

// Business Logic: Compute Settlement State and Flags
function computeStatusAndIssue(netSettled, txnAmount, hadCredit, hasSettlement, txnDateStr, lastSettlementDateStr) {
    let status = "PENDING";
    
    if (!hasSettlement || netSettled === 0) {
        status = "PENDING";
    } else if (netSettled > txnAmount) {
        status = "OVER_SETTLED";
    } else if (Math.abs(netSettled - txnAmount) < 1e-9) {
        status = "FULLY_SETTLED";
    } else if (hadCredit && netSettled < txnAmount) {
        status = "REFUNDED";
    } else if (netSettled < txnAmount) {
        status = "PARTIAL";
    }

    let critical = false;
    let warning = false;

    if (netSettled > txnAmount) critical = true;

    if (!hasSettlement) {
        const txnDate = parseISO(txnDateStr);
        if (differenceInDays(new Date(), txnDate) > 7) {
            critical = true;
        }
    }

    if (netSettled < txnAmount && netSettled > 0 && !hadCredit) {
        warning = true;
    }

    let issueFlag = "NONE";
    if (critical) issueFlag = "CRITICAL";
    else if (warning) issueFlag = "WARNING";

    return { status, issueFlag };
}

// Helper Logic: Mutates and recalculates parent transactional row parameters
async function recalcTransaction(connection, transactionId) {
    const [txns] = await connection.execute("SELECT * FROM transactions WHERE transaction_id = ?", [transactionId]);
    if (txns.length === 0) return null;
    const txn = txns[0];

    const [rows] = await connection.execute("SELECT * FROM settlement_history WHERE transaction_id = ?", [transactionId]);

    let debit = 0, credit = 0;
    let lastDate = null;
    let hadCredit = false;

    for (const r of rows) {
        const amt = parseFloat(r.settlement_amount);
        if (r.settlement_type === "DEBIT") debit += amt;
        if (r.settlement_type === "CREDIT") {
            credit += amt;
            hadCredit = true;
        }

        const sd = parseISO(r.settlement_date);
        if (!lastDate || sd > lastDate) {
            lastDate = sd;
        }
    }

    const net = debit - credit;
    const txnAmount = parseFloat(txn.transaction_amount);
    const hasSettlement = rows.length > 0;
    const lastDateStr = lastDate ? formatDate(lastDate) : null;

    const { status } = computeStatusAndIssue(net, txnAmount, hadCredit, hasSettlement, txn.transaction_date, lastDateStr);

    await connection.execute(`
        UPDATE transactions
        SET settlement_status = ?, total_settled_amount = ?, last_settlement_date = ?
        WHERE transaction_id = ?
    `, [status, Math.round(net * 100) / 100, lastDateStr, transactionId]);

    return { status, net: Math.round(net * 100) / 100, lastSettlementDate: lastDateStr };
}

// 1. POST /init-db — Initialize Database Schemas
app.post('/api/init-db', async (req, res) => {
    let connection;
    try {
        connection = await pool.getConnection();
        const sqlPath = path.join(__dirname, 'db_init.sql');
        const sqlQueries = fs.readFileSync(sqlPath, 'utf8')
            .split(';')
            .map(q => q.trim())
            .filter(q => q.length > 0);

        for (const query of sqlQueries) {
            await connection.query(query);
        }
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    } finally {
        if (connection) connection.release();
    }
});

// 2. POST /reconcile — Match CSV payload to transaction tables
app.post('/api/reconcile', async (req, res) => {
    const content = req.body.csv_text || "";
    if (!content) {
        return res.status(400).json({ error: "No CSV provided inside text value parameter body 'csv_text'" });
    }

    let records;
    try {
        records = parse(content, { columns: true, skip_empty_lines: true, trim: true });
    } catch (e) {
        return res.status(400).json({ error: "Malformed CSV format payload error" });
    }

    if (records.length === 0) return res.json({ processed_rows: 0 });

    const requiredCols = ["settlement_id", "settlement_date", "settlement_amount", "settlement_type", "currency", "transaction_date", "merchant_name", "account_id"];
    const headers = Object.keys(records[0]);
    const missing = requiredCols.filter(col => !headers.includes(col));
    if (missing.length > 0) {
        return res.status(400).json({ error: `CSV missing required columns: ${missing.sort().join(', ')}` });
    }

    let processed = 0, inserted = 0, matched = 0, alreadyExist = 0;
    let unmatchedRows = [], errors = [], recalcErrors = [];
    let updatedTransactions = new Set();

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        await connection.execute("DELETE FROM settlement_history"); // Resets allocation history log cleanly

        for (const row of records) {
            processed++;
            try {
                const sid = row.settlement_id.trim();
                if (!sid) {
                    errors.push({ row, error: "missing settlement_id" });
                    continue;
                }

                const [dup] = await connection.execute("SELECT 1 FROM settlement_history WHERE settlement_id = ?", [sid]);
                if (dup.length > 0) {
                    alreadyExist++;
                    continue;
                }

                const lifecycleId = row.lifecycle_id ? row.lifecycle_id.trim() || null : null;
                const acc = row.account_id.trim();
                const merch = row.merchant_name.trim();

                let txnDateObj, sDateObj;
                try {
                    txnDateObj = parseISO(row.transaction_date);
                    sDateObj = parseISO(row.settlement_date);
                } catch (dateErr) {
                    errors.push({ row, error: `Invalid date format: ${dateErr.message}` });
                    continue;
                }

                const amount = parseFloat(row.settlement_amount);
                if (isNaN(amount)) {
                    errors.push({ row, error: "Invalid settlement_amount" });
                    continue;
                }

                const sType = row.settlement_type.trim().toUpperCase();
                const currency = row.currency.trim().toUpperCase();

                if (amount <= 0) {
                    errors.push({ row, error: "non-positive settlement_amount" });
                    continue;
                }
                if (sType !== "DEBIT" && sType !== "CREDIT") {
                    errors.push({ row, error: "settlement_type must be DEBIT or CREDIT" });
                    continue;
                }

                // Match Stage A: Check primary identifier
                let txn = null;
                if (lifecycleId) {
                    const [res] = await connection.execute("SELECT * FROM transactions WHERE lifecycle_id = ?", [lifecycleId]);
                    if (res.length > 0) txn = res[0];
                }

                // Match Stage B: Check fallback descriptors
                if (!txn) {
                    const [exactMatch] = await connection.execute(`
                        SELECT * FROM transactions 
                        WHERE account_id = ? AND merchant_name = ? AND transaction_date = ?
                    `, [acc, merch, formatDate(txnDateObj)]);
                    
                    if (exactMatch.length > 0) {
                        txn = exactMatch[0];
                    } else {
                        // Match Stage C: Try fuzzy date processing window interval checks (+- 1 day window)
                        const dateBefore = formatDate(subDays(txnDateObj, 1));
                        const dateAfter = formatDate(addDays(txnDateObj, 1));
                        const targetDateStr = formatDate(txnDateObj);

                        const [rangeMatch] = await connection.execute(`
                            SELECT *, ABS(DATEDIFF(transaction_date, ?)) as date_diff FROM transactions 
                            WHERE account_id = ? AND merchant_name = ? AND transaction_date BETWEEN ? AND ?
                            ORDER BY date_diff ASC LIMIT 1
                        `, [targetDateStr, acc, merch, dateBefore, dateAfter]);

                        if (rangeMatch.length > 0) txn = rangeMatch[0];
                    }
                }

                if (!txn) {
                    unmatchedRows.push(row);
                    continue;
                }

                if (["FAILED", "DECLINED"].includes(txn.status) || txn.settlement_status === "NOT_APPLICABLE") {
                    unmatchedRows.push({ ...row, reason: "transaction not eligible" });
                    continue;
                }

                const txnCurrency = (txn.currency || "").toUpperCase();
                if (txnCurrency && txnCurrency !== currency) {
                    errors.push({ row, error: `currency mismatch: txn=${txn.currency} csv=${currency}` });
                    continue;
                }

                await connection.execute(`
                    INSERT INTO settlement_history (settlement_id, transaction_id, lifecycle_id, settlement_date, settlement_amount, settlement_type, currency)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                `, [sid, txn.transaction_id, txn.lifecycle_id, formatDate(sDateObj), Math.round(amount * 100) / 100, sType, currency]);

                inserted++;
                matched++;
                updatedTransactions.add(txn.transaction_id);

            } catch (rowErr) {
                errors.push({ row, error: `Row processing failed: ${rowErr.message}` });
            }
        }

        await connection.commit();

        // Run updates loop sequentially on target records modified
        for (const tId of updatedTransactions) {
            try {
                await recalcTransaction(connection, tId);
            } catch (err) {
                recalcErrors.push(`Failed to recalculate transaction ${tId}: ${err.message}`);
            }
        }

        // Post-Execution Dashboard Summary Aggregator
        let dashboard = {};
        try {
            const [[{ c: totalTxns }]] = await connection.execute("SELECT COUNT(*) as c FROM transactions");
            const [[{ c: totalSettlements }]] = await connection.execute("SELECT COUNT(*) as c FROM settlement_history");

            const [statusRows] = await connection.execute("SELECT settlement_status, COUNT(*) as c FROM transactions GROUP BY settlement_status");
            const breakdown = {};
            statusRows.forEach(r => breakdown[r.settlement_status] = r.c);

            const [txnsList] = await connection.execute("SELECT * FROM transactions");
            let criticalCount = 0, warningCount = 0, outstandingTotal = 0, settledCount = 0;
            let totalDaysToSettle = 0;

            for (const t of txnsList) {
                const [srows] = await connection.execute("SELECT settlement_type, settlement_amount FROM settlement_history WHERE transaction_id = ?", [t.transaction_id]);
                
                let debit = 0, credit = 0, hadCredit = false;
                srows.forEach(r => {
                    const amt = parseFloat(r.settlement_amount);
                    if (r.settlement_type === "DEBIT") debit += amt;
                    if (r.settlement_type === "CREDIT") { credit += amt; hadCredit = true; }
                });

                const net = debit - credit;
                const { issueFlag } = computeStatusAndIssue(net, parseFloat(t.transaction_amount), hadCredit, srows.length > 0, t.transaction_date, t.last_settlement_date);

                if (issueFlag === "CRITICAL") criticalCount++;
                if (issueFlag === "WARNING") warningCount++;

                outstandingTotal += Math.max(0.0, parseFloat(t.transaction_amount) - net);
                if (t.last_settlement_date) {
                    totalDaysToSettle += differenceInDays(parseISO(t.last_settlement_date), parseISO(t.transaction_date));
                    settledCount++;
                }
            }

            dashboard = {
                total_transactions: totalTxns,
                total_settlements: totalSettlements,
                breakdown_by_status: breakdown,
                critical_issues: criticalCount,
                warning_issues: warningCount,
                total_outstanding_amount: Math.round(outstandingTotal * 100) / 100,
                avg_days_to_settle: settledCount > 0 ? Math.round((totalDaysToSettle / settledCount) * 100) / 100 : 0,
                settlement_rate: totalTxns > 0 ? Math.round((settledCount / totalTxns) * 100) / 100 : 0
            };

        } catch (dashErr) {
            dashboard = { error: `Dashboard calculation failed: ${dashErr.message}` };
        }

        res.json({
            processed_rows: processed,
            inserted_settlements: inserted,
            matched_rows: matched,
            already_existing: alreadyExist,
            unmatched_rows: unmatchedRows,
            errors,
            updated_transactions: updatedTransactions.size,
            dashboard,
            ...(recalcErrors.length > 0 && { recalculation_errors: recalcErrors })
        });

    } catch (globalErr) {
        await connection.rollback();
        res.status(500).json({ error: `Transaction failed: ${globalErr.message}` });
    } finally {
        connection.release();
    }
});

// 3. GET /transactions — List transactions with optional status filter
app.get('/api/transactions', async (req, res) => {
    const statusFilter = req.query.status;
    let query = "SELECT * FROM transactions";
    let args = [];

    if (statusFilter) {
        query += " WHERE settlement_status = ?";
        args.push(statusFilter);
    }

    try {
        const [rows] = await pool.execute(query, args);
        const result = [];

        for (const t of rows) {
            const [srows] = await pool.execute("SELECT settlement_type, settlement_amount FROM settlement_history WHERE transaction_id = ?", [t.transaction_id]);
            
            let debit = 0, credit = 0, hadCredit = false;
            srows.forEach(r => {
                const amt = parseFloat(r.settlement_amount);
                if (r.settlement_type === "DEBIT") debit += amt;
                if (r.settlement_type === "CREDIT") { credit += amt; hadCredit = true; }
            });

            const net = debit - credit;
            const { issueFlag } = computeStatusAndIssue(net, parseFloat(t.transaction_amount), hadCredit, srows.length > 0, t.transaction_date, t.last_settlement_date);

            result.push({
                ...t,
                issue_flag: issueFlag,
                net_settled: Math.round(net * 100) / 100
            });
        }
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 4. GET /transactions/:txn_id — Single entry inspection lookup
app.get('/api/transactions/:txn_id', async (req, res) => {
    try {
        const [txns] = await pool.execute("SELECT * FROM transactions WHERE transaction_id = ?", [req.params.txn_id]);
        if (txns.length === 0) return res.status(404).json({ error: "not found" });

        const [settlements] = await pool.execute("SELECT * FROM settlement_history WHERE transaction_id = ? ORDER BY settlement_date ASC", [req.params.txn_id]);
        res.json({
            transaction: txns[0],
            settlements: settlements
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 5. GET /dashboard/summary — Realtime health metrics overview
app.get('/api/dashboard/summary', async (req, res) => {
    try {
        const [[{ c: totalTxns }]] = await pool.execute("SELECT COUNT(*) as c FROM transactions");
        const [[{ c: totalSettlements }]] = await pool.execute("SELECT COUNT(*) as c FROM settlement_history");

        const [statusRows] = await pool.execute("SELECT settlement_status, COUNT(*) as c FROM transactions GROUP BY settlement_status");
        const breakdown = {};
        statusRows.forEach(r => breakdown[r.settlement_status] = r.c);

        const [txns] = await pool.execute("SELECT * FROM transactions");
        let critical = 0, warning = 0, outstandingTotal = 0, settledCount = 0;
        let totalDays = 0;

        for (const t of txns) {
            const [srows] = await pool.execute("SELECT settlement_type, settlement_amount FROM settlement_history WHERE transaction_id = ?", [t.transaction_id]);
            
            let debit = 0, credit = 0, hadCredit = false;
            srows.forEach(r => {
                const amt = parseFloat(r.settlement_amount);
                if (r.settlement_type === "DEBIT") debit += amt;
                if (r.settlement_type === "CREDIT") { credit += amt; hadCredit = true; }
            });

            const net = debit - credit;
            const { issueFlag } = computeStatusAndIssue(net, parseFloat(t.transaction_amount), hadCredit, srows.length > 0, t.transaction_date, t.last_settlement_date);

            if (issueFlag === "CRITICAL") critical++;
            else if (issueFlag === "WARNING") warning++;

            outstandingTotal += Math.max(0.0, parseFloat(t.transaction_amount) - net);
            if (t.last_settlement_date) {
                totalDays += differenceInDays(parseISO(t.last_settlement_date), parseISO(t.transaction_date));
                settledCount++;
            }
        }

        res.json({
            total_transactions: totalTxns,
            total_settlements: totalSettlements,
            breakdown_by_status: breakdown,
            critical_issues: critical,
            warning_issues: warning,
            total_outstanding_amount: Math.round(outstandingTotal * 100) / 100,
            avg_days_to_settle: settledCount > 0 ? Math.round((totalDays / settledCount) * 100) / 100 : 0,
            settlement_rate: totalTxns > 0 ? Math.round((settledCount / totalTxns) * 100) / 100 : 0
        });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Port Execution Launch Configuration
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});