import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Logo from "@/components/brand/Logo";
import { updateUserPassword } from "@/services/authService";
import { useAuth } from "@/hooks/useAuth";
import { toUserMessage } from "@/utils/errors";

// Where ForgotPasswordPage's reset link actually lands: Supabase puts a
// recovery token in the URL, its client SDK exchanges it for a real
// (short-lived, password-change-only) session automatically on load —
// no code needed here for that part, useAuth's own Supabase listener
// already picks it up like any other session. This page's only job is
// asking for the new password and calling updateUserPassword() while
// that session is live.
export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await updateUserPassword(password);
      setDone(true);
    } catch (err) {
      setError(toUserMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ maxWidth: 400, margin: "0 auto", padding: "var(--space-xl) 0" }}>
      <div style={{ display: "flex", justifyContent: "center", marginBottom: "var(--space-md)" }}>
        <Logo variant="full" height={56} />
      </div>

      <h1 style={{ fontSize: "var(--text-2xl)", marginBottom: 4, textAlign: "center" }}>Set a new password</h1>

      {done ? (
        <div className="card" style={{ textAlign: "center", display: "grid", gap: "var(--space-sm)" }}>
          <span className="mi" style={{ fontSize: 32, color: "var(--color-success)" }}>check_circle</span>
          <p style={{ fontWeight: 600 }}>Password updated</p>
          <button className="btn btn-primary" onClick={() => navigate("/login", { replace: true })}>
            Continue to login
          </button>
        </div>
      ) : loading ? (
        <p className="text-soft" style={{ textAlign: "center", fontSize: "var(--text-sm)" }}>Checking your reset link...</p>
      ) : !user ? (
        <div className="card" style={{ textAlign: "center", display: "grid", gap: "var(--space-sm)" }}>
          <span className="mi" style={{ fontSize: 32, color: "var(--color-danger)" }}>error</span>
          <p style={{ fontWeight: 600 }}>This reset link isn't valid</p>
          <p className="text-soft" style={{ fontSize: "var(--text-sm)" }}>
            It may have expired or already been used. Request a new one from the login page.
          </p>
          <Link className="btn btn-outline" to="/forgot-password">Request a new link</Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} style={{ display: "grid", gap: "var(--space-sm)" }}>
          <label>
            New password
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{ width: "100%", padding: 10, borderRadius: "var(--radius-sm)", border: "1px solid var(--color-line)" }}
            />
          </label>
          <label>
            Confirm new password
            <input
              type="password"
              required
              minLength={6}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              style={{ width: "100%", padding: 10, borderRadius: "var(--radius-sm)", border: "1px solid var(--color-line)" }}
            />
          </label>
          {error && <p style={{ color: "var(--color-danger)", fontSize: "var(--text-sm)" }}>{error}</p>}
          <button className="btn btn-primary" type="submit" disabled={busy}>
            {busy ? "Saving..." : "Save new password"}
          </button>
        </form>
      )}

      <p className="text-soft" style={{ textAlign: "center", marginTop: "var(--space-md)", fontSize: "var(--text-sm)" }}>
        <Link to="/login" style={{ color: "var(--color-primary)" }}>← Back to login</Link>
      </p>
    </div>
  );
}
