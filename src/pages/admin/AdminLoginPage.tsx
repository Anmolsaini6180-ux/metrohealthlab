import { useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import Logo from "@/components/brand/Logo";
import { useAdminRole } from "@/hooks/useAdminRole";
import { loginWithEmail, loginWithGoogle, logout } from "@/services/authService";
import { resolveStaffContext } from "@/services/roleService";
import { adminHomePathForRole } from "@/utils/roleAccess";
import { toUserMessage } from "@/utils/errors";
import type { User } from "firebase/auth";

export default function AdminLoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: Location })?.from?.pathname ?? "/admin";
  const { role, loading: roleLoading } = useAdminRole();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"email" | "google" | null>(null);

  // Already signed in with a valid staff role — skip straight past the form.
  if (!roleLoading && role) {
    const home = adminHomePathForRole(role) ?? "/admin";
    return <Navigate to={from === "/admin" ? home : from} replace />;
  }

  // Shared tail for both sign-in methods. The role comes from
  // Firestore — system/config for the master account, users/{uid} for
  // everybody else — read here so the redirect target is right on the
  // first attempt. It is read again by AuthProvider, and enforced
  // independently by firestore.rules on every request the admin
  // screens then make; landing on /admin proves nothing by itself.
  async function completeSignIn(user: User) {
    const staff = await resolveStaffContext(user);
    const home = adminHomePathForRole(staff.role);
    if (!home) {
      // Valid Firebase credentials, but not a staff account — reject
      // here rather than letting them into any part of /admin.
      await logout();
      setError("This account isn't authorized for admin access.");
      return;
    }
    navigate(from === "/admin" ? home : from, { replace: true });
  }

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy("email");
    setError(null);
    try {
      await completeSignIn(await loginWithEmail(email, password));
    } catch (err) {
      setError(toUserMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function handleGoogle() {
    setBusy("google");
    setError(null);
    try {
      await completeSignIn(await loginWithGoogle());
    } catch (err) {
      setError(toUserMessage(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mh-admin-login">
      <div style={{ display: "flex", justifyContent: "center", marginBottom: "var(--space-md)" }}>
        <Logo variant="full" height={56} />
      </div>
      <h1 style={{ fontSize: "var(--text-xl)", textAlign: "center", marginBottom: "var(--space-xs)" }}>
        Admin sign in
      </h1>
      <p className="text-soft" style={{ fontSize: "var(--text-sm)", textAlign: "center", marginBottom: "var(--space-md)" }}>
        Use the Google account your admin access was granted to.
      </p>

      <button
        className="btn btn-outline"
        style={{ width: "100%" }}
        onClick={handleGoogle}
        disabled={busy !== null}
      >
        {busy === "google" ? "Signing in..." : "Continue with Google"}
      </button>

      <div className="mh-or-divider">
        <span>or use an email &amp; password</span>
      </div>

      <form onSubmit={handleEmailSubmit} style={{ display: "grid", gap: "var(--space-sm)" }}>
        <label>
          Email
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label>
          Password
          <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {error && <p style={{ color: "var(--color-danger)", fontSize: "var(--text-sm)" }}>{error}</p>}
        <button className="btn btn-primary" type="submit" disabled={busy !== null}>
          {busy === "email" ? "Signing in..." : "Sign in"}
        </button>
      </form>
    </div>
  );
}
