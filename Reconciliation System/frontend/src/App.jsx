import { BrowserRouter as Router, Routes, Route, Link } from "react-router-dom";
import SummaryPage from "./SummaryPage";
import TransactionsPage from "./TransactionsPage";
import TransactionDetailPage from "./TransactionDetailPage";
import WelcomePage from "./WelcomePage"; // 👈 import new page

export default function App() {
  return (
    <Router>
      <div style={{ paddingTop: "20px", fontFamily: "Inter, sans-serif", width: "100%" }}>
        <nav style={{ marginBottom: 25, display: "flex", justifyContent:"space-evenly", paddingHorizontal: 50 }}>

          <Link to="/">
          <button style={{ padding: "10px 20px", borderRadius: "30px", border: "1px solid #ccc", background: "#f5f5f5", cursor: "pointer", }}>
            🏠 Home
          </button>
        </Link>


          <Link to="/summary">
            <button style={{ padding: "10px 20px", borderRadius: "30px", border: "1px solid #ccc", background: "#f5f5f5", cursor: "pointer" }}>
              📊 Summary
            </button>
          </Link>

          <Link to="/transactions">
            <button style={{ padding: "10px 20px", borderRadius: "30px", border: "1px solid #ccc", background: "#f5f5f5", cursor: "pointer" }}>
              💳 Transactions
            </button>
          </Link>
        </nav>

        <Routes>
          <Route path="/" element={<WelcomePage />} />   {/* 👈 Default page */}
          <Route path="/summary" element={<SummaryPage />} />
          <Route path="/transactions" element={<TransactionsPage />} />
          <Route path="/transactions/:id" element={<TransactionDetailPage />} />
          <Route path="*" element={<WelcomePage />} />   {/* 👈 fallback */}
        </Routes>
      </div>
    </Router>
  );
}