import { useState } from "react";
import { Link } from "react-router-dom";
import Logo from "@/components/brand/Logo";
import { resetPassword } from "@/services/authService";
import { toUserMessage } from "@/utils/errors";
import Seo from "@/components/common/Seo";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await resetPassword(email);
      setSent(true);
    } catch (err) {
      setError(toUserMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ maxWidth: 400, margin: "0 auto", padding: "var(--space-xl) 0" }}>
      <Seo title="Forgot Password" description="Reset your Metro Health Lab account password." path="/forgot-password" index={false} />
      <div style={{ display: "flex", justifyContent: "center", marginBottom: "var(--space-md)" }}>
        <Logo variant="full" height={56} />
      </div>

      <h1 style={{ fontSize: "var(--text-2xl)", marginBottom: 4, textAlign: "center" }}>Reset your password</h1>
      <p className="text-soft" style={{ textAlign: "center", marginBottom: "var(--space-md)", fontSize: "var(--text-sm)" }}>
        Enter the email on your account and we'll send a reset link.
      </p>

      {sent ? (
        <div className="card" style={{ textAlign: "center", display: "grid", gap: "var(--space-sm)" }}>
          <span className="mi" style={{ fontSize: 32, color: "var(--color-success)" }}>
            mark_email_read
          </span>
          <p style={{ fontWeight: 600 }}>Check your email</p>
          <p className="text-soft" style={{ fontSize: "var(--text-sm)" }}>
            If an account exists for {email}, a password reset link is on its way.
          </p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} style={{ display: "grid", gap: "var(--space-sm)" }}>
          <label>
            Email
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{ width: "100%", padding: 10, borderRadius: "var(--radius-sm)", border: "1px solid var(--color-line)" }}
            />
          </label>
          {error && <p style={{ color: "var(--color-danger)", fontSize: "var(--text-sm)" }}>{error}</p>}
          <button className="btn btn-primary" type="submit" disabled={busy}>
            {busy ? "Sending..." : "Send reset link"}
          </button>
        </form>
      )}

      <p className="text-soft" style={{ textAlign: "center", marginTop: "var(--space-md)", fontSize: "var(--text-sm)" }}>
        <Link to="/login" style={{ color: "var(--color-primary)" }}>← Back to login</Link>
      </p>
    </div>
  );
}
