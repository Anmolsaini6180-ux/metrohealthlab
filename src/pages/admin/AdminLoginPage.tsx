import { useEffect, useRef, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import Logo from "@/components/brand/Logo";
import { useAuth } from "@/hooks/useAuth";
import { useAdminRole } from "@/hooks/useAdminRole";
import { loginWithEmail, loginWithGoogle, logout } from "@/services/authService";
import { adminAccessDenialReason, adminHomePathForRole } from "@/utils/roleAccess";
import { describeSignInError } from "@/utils/authErrors";

export default function AdminLoginPage() {
  const location = useLocation();
  const from = (location.state as { from?: Location })?.from?.pathname ?? "/admin";
  const { user, loading: authLoading } = useAuth();
  const staffContext = useAdminRole();
  const { role, loading: roleLoading } = staffContext;

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"email" | "google" | null>(null);
  // Google now redirects the whole browser away and back — there is no
  // single function call left to wrap in try/catch for the "signed in
  // but not staff" outcome, unlike email/password below. This effect is
  // what actually reacts to that outcome, for BOTH sign-in methods,
  // once useAuth has resolved a real (non-loading) verdict. Guarded so
  // it only ever acts once per distinct rejected account, not on every
  // render.
  const rejectedUid = useRef<string | null>(null);

  useEffect(() => {
    if (authLoading || roleLoading) return;
    if (!user) return; // not signed in at all — nothing to do, stay on the form
    if (role) return; // handled by the early-return redirect below

    if (rejectedUid.current === user.uid) return; // already rejected this exact sign-in
    rejectedUid.current = user.uid;

    console.error(
      `[admin-login] Signed in as uid ${user.uid} (${user.provider}), but this account resolves to no admin ` +
        `role. ${adminAccessDenialReason(staffContext)} See DEPLOYMENT.md -> "First SUPER_ADMIN bootstrap".`
    );
    setError("This account isn't authorized for admin access.");
    logout().catch((err) => console.error("[admin-login] Could not sign out the rejected account:", err));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, role, authLoading, roleLoading]);

  // Already signed in with a valid staff role — skip straight past the form.
  if (!authLoading && !roleLoading && role) {
    const home = adminHomePathForRole(role) ?? "/admin";
    return <Navigate to={from === "/admin" ? home : from} replace />;
  }

  function reportSignInFailure(method: "Google" | "Email", err: unknown) {
    const info = describeSignInError(err);
    const line = `[admin-login] ${method} sign-in failed (${info.code}).`;
    // Nothing here logs a token, a password or a credential — only
    // Supabase's own error code and its error object.
    if (info.silent) console.info(line);
    else console.error(line, err);
    setError(info.silent ? null : info.message);
  }

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy("email");
    setError(null);
    try {
      await loginWithEmail(email, password);
      // Resolution (role check, redirect-or-reject) happens in the
      // effect above once useAuth picks up the new session — same path
      // Google's redirect uses, so both methods are handled identically
      // from here on.
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
      // Comes straight back to this exact page — the effect above
      // takes it from there once the redirect completes.
      await loginWithGoogle(`${window.location.origin}/admin/login`);
    } catch (err) {
      reportSignInFailure("Google", err);
      setBusy(null);
    }
    // No `finally`: a successful call navigates the browser away before
    // this line would ever run.
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
        {busy === "google" ? "Redirecting to Google..." : "Continue with Google"}
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
