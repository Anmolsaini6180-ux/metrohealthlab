import { useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import Logo from "@/components/brand/Logo";
import { useAdminRole } from "@/hooks/useAdminRole";
import { loginWithEmail, logout } from "@/services/authService";
import { toUserMessage } from "@/utils/errors";

export default function AdminLoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: Location })?.from?.pathname ?? "/admin";
  const { role, loading: roleLoading } = useAdminRole();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Already signed in with a valid staff role — skip straight past the form.
  if (!roleLoading && role) {
    const destination = from === "/admin" && role === "COLLECTION_AGENT" ? "/agent" : from;
    return <Navigate to={destination} replace />;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const user = await loginWithEmail(email, password);
      const token = await user.getIdTokenResult(true);
      if (!token.claims.role) {
        // Valid Firebase credentials, but not a staff account — reject
        // here rather than letting them into any part of /admin.
        await logout();
        setError("This account isn't authorized for admin access.");
        return;
      }
      const defaultDestination = token.claims.role === "COLLECTION_AGENT" ? "/agent" : "/admin";
      navigate(from === "/admin" ? defaultDestination : from, { replace: true });
    } catch (err) {
      setError(toUserMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ maxWidth: 380, margin: "var(--space-xl) auto" }}>
      <div style={{ display: "flex", justifyContent: "center", marginBottom: "var(--space-md)" }}>
        <Logo variant="full" height={56} />
      </div>
      <h1 style={{ fontSize: "var(--text-xl)", textAlign: "center", marginBottom: "var(--space-md)" }}>
        Admin sign in
      </h1>
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
        <label>
          Password
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{ width: "100%", padding: 10, borderRadius: "var(--radius-sm)", border: "1px solid var(--color-line)" }}
          />
        </label>
        {error && <p style={{ color: "var(--color-danger)", fontSize: "var(--text-sm)" }}>{error}</p>}
        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? "Signing in..." : "Sign in"}
        </button>
      </form>
    </div>
  );
}
