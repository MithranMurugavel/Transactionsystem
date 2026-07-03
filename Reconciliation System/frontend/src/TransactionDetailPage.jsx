import { useEffect, useState, useMemo } from "react";
import { useParams } from "react-router-dom";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from "recharts";

export default function TransactionDetailPage() {
  const { id } = useParams();
  const [data, setData] = useState(null);

  useEffect(() => {
    fetch("/api/transactions/" + id).then(r => r.json()).then(setData);
  }, [id]);

  // 📊 Settlement trend
  const settlementChart = useMemo(() => {
    if (!data) return [];
    return data.settlements.map(s => ({
      date: s.settlement_date,
      amount: s.settlement_amount
    }));
  }, [data]);

  if (!data) return <p style={{ padding: 20 }}>Loading...</p>;

  return (
    <div style={{ fontFamily: "Inter, sans-serif", padding: 24, background: "#f9fafb", minHeight: "100vh" }}>
      <h2 style={{ fontSize: 28, fontWeight: 700, marginBottom: 20 }}>
        🧾 Transaction {data.transaction.transaction_id}
      </h2>

      {/* Transaction Summary Card */}
      <div style={{ background: "#fff", borderRadius: 16, padding: 20, marginBottom: 28, boxShadow: "0 4px 12px rgba(0,0,0,0.05)" }}>
        <p><b>Merchant:</b> {data.transaction.merchant_name}</p>
        <p><b>Amount:</b> ${data.transaction.transaction_amount}</p>
        <p>
          <b>Status:</b>{" "}
          <StatusBadge status={data.transaction.settlement_status} />
        </p>
      </div>

      {/* 📊 Settlement Trend */}
      <div style={{ width: "100%", height: 280 }}>
  <ResponsiveContainer>
    <AreaChart data={settlementChart}>
      <defs>
        <linearGradient id="colorAmount" x1="0" y1="0" x2="0" y2="1">
          <stop offset="5%" stopColor="#6366f1" stopOpacity={0.8}/>
          <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
        </linearGradient>
      </defs>
      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
      <XAxis dataKey="date" />
      <YAxis />
      <Tooltip />
      <Area
        type="monotone"
        dataKey="amount"
        stroke="#6366f1"
        fillOpacity={1}
        fill="url(#colorAmount)"
      />
    </AreaChart>
  </ResponsiveContainer>
</div>

      {/* Settlement History */}
      <div style={{ background: "#fff", borderRadius: 16, padding: 20, boxShadow: "0 4px 12px rgba(0,0,0,0.05)" }}>
        <h3 style={{ marginTop: 0, marginBottom: 16 }}>📋 Settlements</h3>
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {data.settlements.map((s, i) => (
            <li
              key={i}
              style={{
                padding: "12px 16px",
                borderBottom: i < data.settlements.length - 1 ? "1px solid #e5e7eb" : "none",
                display: "flex",
                justifyContent: "space-between"
              }}
            >
              <span>{s.settlement_date}</span>
              <span style={{ fontWeight: 500 }}>
                {s.settlement_type} — ${s.settlement_amount}
              </span>
            </li>
          ))}
        </ul>
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
