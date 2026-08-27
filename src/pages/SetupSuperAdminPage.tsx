import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { bootstrapSuperAdmin } from "@/services/bootstrapService";
import { toUserMessage } from "@/utils/errors";

// Deliberately not linked from any nav/menu — reachable only by typing
// the URL. All real protection is server-side (the function requires
// the private SUPER_ADMIN_BOOTSTRAP_SECRET and permanently refuses to
// run once any SUPER_ADMIN exists), so this page being "hidden" is
// just convenience, not the security boundary.
export default function SetupSuperAdminPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [secret, setSecret] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await bootstrapSuperAdmin(secret, name);
      setDone(true);
      setTimeout(() => navigate("/admin"), 1500);
    } catch (err) {
      setError(toUserMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (loading) return null;
  if (!user) {
    return (
      <div style={{ maxWidth: 400, margin: "var(--space-xl) auto" }}>
        <p>Sign in with any account first (customer signup works fine), then come back to this page.</p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 400, margin: "var(--space-xl) auto" }}>
      <h1 style={{ fontSize: "var(--text-xl)", marginBottom: "var(--space-sm)" }}>One-time SUPER_ADMIN setup</h1>
      <p className="text-soft" style={{ fontSize: "var(--text-sm)", marginBottom: "var(--space-md)" }}>
        This only works once — before any SUPER_ADMIN account exists. You'll need the
        SUPER_ADMIN_BOOTSTRAP_SECRET value set via <code>firebase functions:secrets:set</code>.
      </p>
      {done ? (
        <p style={{ color: "var(--color-success)" }}>Done — redirecting to /admin...</p>
      ) : (
        <form onSubmit={handleSubmit} style={{ display: "grid", gap: "var(--space-sm)" }}>
          <input placeholder="Your name" required value={name} onChange={(e) => setName(e.target.value)} />
          <input type="password" placeholder="Bootstrap secret" required value={secret} onChange={(e) => setSecret(e.target.value)} />
          {error && <p style={{ color: "var(--color-danger)", fontSize: "var(--text-sm)" }}>{error}</p>}
          <button className="btn btn-primary" type="submit" disabled={busy}>
            {busy ? "Setting up..." : "Become SUPER_ADMIN"}
          </button>
        </form>
      )}
    </div>
  );
}
