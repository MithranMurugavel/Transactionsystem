import { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from "recharts";

export default function TransactionsPage() {
  const [rows, setRows] = useState([]);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    const qs = filter ? `?status=${filter}` : "";
    fetch("/api/transactions" + qs).then(r => r.json()).then(setRows);
  }, [filter]);

  // 📊 Prepare chart data
  const chartData = useMemo(() => {
    const groups = {};
    rows.forEach(r => {
      groups[r.settlement_status] =
        (groups[r.settlement_status] || 0) + Number(r.transaction_amount);
    });
    return Object.entries(groups).map(([status, total]) => ({ status, total }));
  }, [rows]);

  return (
    <div style={{ fontFamily: "Inter, sans-serif", padding: 24, background: "#f9fafb", minHeight: "100vh" }}>
      <h2 style={{ fontSize: 28, fontWeight: 700, marginBottom: 12 }}>💳 Transactions</h2>

      {/* Filter */}
      <div style={{ marginBottom: 20 }}>
        <label style={{ marginRight: 8, fontWeight: 500 }}>Filter: </label>
        <select
          value={filter}
          onChange={e => setFilter(e.target.value)}
          style={{
            padding: "6px 12px",
            borderRadius: 8,
            border: "1px solid #d1d5db",
            background: "#fff",
            fontSize: 14,
            cursor: "pointer"
          }}
        >
          <option value="">All</option>
          <option>PENDING</option>
          <option>PARTIAL</option>
          <option>FULLY_SETTLED</option>
          <option>REFUNDED</option>
          <option>OVER_SETTLED</option>
          <option>NOT_APPLICABLE</option>
        </select>
      </div>

      {/* 📊 Chart */}
      <div style={{ background: "#fff", padding: 20, borderRadius: 16, boxShadow: "0 4px 12px rgba(0,0,0,0.05)", marginBottom: 28 }}>
        <h3 style={{ marginTop: 0, marginBottom: 12 }}>📊 Status vs Amount</h3>
        <div style={{ width: "100%", height: 280 }}>
          <ResponsiveContainer>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="status" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="total" fill="#6366f1" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 📋 Transactions Table */}
      <div style={{ background: "#fff", padding: 20, borderRadius: 16, boxShadow: "0 4px 12px rgba(0,0,0,0.05)" }}>
        <h3 style={{ marginTop: 0, marginBottom: 16 }}>📋 Transactions List</h3>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead>
            <tr style={{ background: "#f3f4f6", textAlign: "left" }}>
              <th style={{ padding: "12px 8px" }}>Txn ID</th>
              <th style={{ padding: "12px 8px" }}>Date</th>
              <th style={{ padding: "12px 8px" }}>Merchant</th>
              <th style={{ padding: "12px 8px" }}>Amount</th>
              <th style={{ padding: "12px 8px" }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {Array.isArray(rows) ? (
              rows.map((r, i) => (
                <tr
                  key={r.transaction_id}
                  style={{
                    background: i % 2 === 0 ? "#fff" : "#f9fafb",
                    borderBottom: "1px solid #e5e7eb"
                  }}
                >
                  <td style={{ padding: "10px 8px" }}>
                    <Link to={`/transactions/${r.transaction_id}`} style={{ color: "#2563eb", fontWeight: 500 }}>
                      {r.transaction_id}
                    </Link>
                  </td>
                  <td style={{ padding: "10px 8px" }}>{r.transaction_date}</td>
                  <td style={{ padding: "10px 8px" }}>{r.merchant_name}</td>
                  <td style={{ padding: "10px 8px" }}>${Number(r.transaction_amount || 0).toFixed(2)}</td>
                  <td style={{ padding: "10px 8px" }}>
                    <StatusBadge status={r.settlement_status} />
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="5" style={{ textAlign: "center", padding: 15 }}>
                  Failed loading transaction records list.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* 🎨 Status Badge */
function StatusBadge({ status }) {
  const COLORS = {
    FULLY_SETTLED: "#10b981",
    REFUNDED: "#f59e0b",
    PARTIAL: "#8b5cf6",
    OVER_SETTLED: "#ef4444",
    PENDING: "#6b7280",
    NOT_APPLICABLE: "#4b5563"
  };

  return (
    <span
      style={{
        background: COLORS[status] || "#9ca3af",
        color: "white",
        padding: "4px 10px",
        borderRadius: 12,
        fontSize: 12,
        fontWeight: 600
      }}
    >
      {status}
    </span>
  );
}
