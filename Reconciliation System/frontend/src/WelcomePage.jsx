import { Link } from "react-router-dom";
import { ArrowRight, BarChart2, FileText, CreditCard } from "lucide-react";

const WelcomePage = () => {
  return (
    <section
      style={{
        minHeight: "90vh",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        fontFamily: "Inter, sans-serif",
      }}
    >
      <div
        style={{
          padding: "40px 60px",
          borderRadius: "20px",
          textAlign: "center",
          display: "flex",
          flexDirection: "column",
          gap: "20px",
          maxWidth: "700px",
          width: "90%",
          paddingBottom: "250px",
        }}
      >
        {/* Title */}
        <h1
          style={{
            fontSize: "3rem",
            fontWeight: "bold",
            color: "#1e293b",
            marginBottom: "10px",
          }}
        >
          Welcome 👋
        </h1>

        <p
          style={{
            fontSize: "1.25rem",
            color: "#475569",
            marginBottom: "30px",
          }}
        >
            <span style={{ fontWeight: "600" }}>Transaction Reconciliation System</span>
        </p>

        {/* Features / Icons */}
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            gap: "40px",
            marginBottom: "40px",
          }}
        >
          <div
            style={{
              background: "#f1f5f9",
              padding: "20px",
              borderRadius: "16px",
              transition: "0.3s",
              cursor: "pointer",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.transform = "scale(1.15)")}
            onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
          >
            <CreditCard size={40} color="#6366f1" />
            <p style={{ marginTop: "10px", fontSize: "0.9rem", color: "#334155" }}>
              Manage Transactions
            </p>
          </div>

          <div
            style={{
              background: "#f1f5f9",
              padding: "20px",
              borderRadius: "16px",
              transition: "0.3s",
              cursor: "pointer",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.transform = "scale(1.15)")}
            onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
          >
            <FileText size={40} color="#10b981" />
            <p style={{ marginTop: "10px", fontSize: "0.9rem", color: "#334155" }}>
              Reconcile Files
            </p>
          </div>

          <div
            style={{
              background: "#f1f5f9",
              padding: "20px",
              borderRadius: "16px",
              transition: "0.3s",
              cursor: "pointer",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.transform = "scale(1.15)")}
            onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
          >
            <BarChart2 size={40} color="#f59e0b" />
            <p style={{ marginTop: "10px", fontSize: "0.9rem", color: "#334155" }}>
              Analyze Reports
            </p>
          </div>
        </div>

        {/* CTA Button */}
        <Link to="/summary">
          <button
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              padding: "12px 24px",
              fontSize: "1rem",
              fontWeight: "600",
              borderRadius: "30px",
              border: "none",
              background: "linear-gradient(135deg, #6366f1, #3b82f6)",
              color: "#fff",
              cursor: "pointer",
              boxShadow: "0 5px 15px rgba(99,102,241,0.4)",
              transition: "0.3s",
            }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.boxShadow = "0 8px 20px rgba(99,102,241,0.6)")
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.boxShadow = "0 5px 15px rgba(99,102,241,0.4)")
            }
          >
            Get Started <ArrowRight size={18} />
          </button>
        </Link>
      </div>
    </section>
  );
};

export default WelcomePage;
