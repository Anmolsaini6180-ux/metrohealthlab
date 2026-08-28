import { useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import Logo from "@/components/brand/Logo";
import { useAdminRole } from "@/hooks/useAdminRole";
import { loginWithEmail, loginWithGoogle, logout } from "@/services/authService";
import { resolveStaffContext } from "@/services/roleService";
import { adminAccessDenialReason, adminHomePathForRole } from "@/utils/roleAccess";
import { describeSignInError } from "@/utils/authErrors";
import type { StaffContext } from "@/types/team";
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
    let staff: StaffContext;
    try {
      staff = await resolveStaffContext(user);
    } catch (err) {
      // The authorization record could not be READ — rules denied it,
      // the network dropped, the transport was blocked. That is a
      // technical failure, NOT a verdict about this account, and
      // saying "you aren't authorized" here is what previously made
      // the real problem invisible. Still fails closed: no role is
      // granted and the session is ended.
      const info = describeSignInError(err);
      console.error(
        `[admin-login] Could not resolve the staff role for uid ${user.uid} (${info.code}).`,
        err
      );
      await logout();
      setError(info.message);
      return;
    }

    const home = adminHomePathForRole(staff.role);
    if (!home) {
      // Valid Firebase credentials, but not a staff account — reject
      // here rather than letting them into any part of /admin. The
      // user-facing wording stays deliberately vague; the console gets
      // the specific reason so the project owner can fix the data.
      console.error(
        `[admin-login] Signed in as uid ${user.uid}, but this account resolves to no admin role. ` +
          `${adminAccessDenialReason(staff)} ` +
          'See DEPLOYMENT.md -> "First SUPER_ADMIN bootstrap".'
      );
      await logout();
      setError("This account isn't authorized for admin access.");
      return;
    }
    navigate(from === "/admin" ? home : from, { replace: true });
  }

  // Both sign-in buttons funnel their failures through here so the
  // nine distinct causes stay distinguishable in the console while the
  // screen keeps a friendly, non-leaky message.
  function reportSignInFailure(method: "Google" | "Email", err: unknown) {
    const info = describeSignInError(err);
    const line = `[admin-login] ${method} sign-in failed (${info.code}).`;
    // Nothing here logs a token, a password or a credential — only
    // Firebase's own error code and its error object.
    if (info.silent) console.info(line);
    else console.error(line, err);
    setError(info.silent ? null : info.message);
  }

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy("email");
    setError(null);
    try {
      await completeSignIn(await loginWithEmail(email, password));
    } catch (err) {
      reportSignInFailure("Email", err);
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
      reportSignInFailure("Google", err);
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
