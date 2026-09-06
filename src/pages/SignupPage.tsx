import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import Logo from "@/components/brand/Logo";
import { loginWithGoogle, registerAndLoginWithEmail } from "@/services/authService";
import { toUserMessage } from "@/utils/errors";

export default function SignupPage() {
  const navigate = useNavigate();
  const location = useLocation();
  // Forwarded from LoginPage's own "Create account" link when this
  // signup was reached via a booking (or any other) login redirect —
  // same shape as LoginPage's own `from`, so a customer who chooses to
  // sign up instead of logging in still lands back where they started
  // rather than on a generic dashboard.
  const from = (location.state as { from?: { pathname: string; state?: unknown } })?.from;
  const fromPath = from?.pathname ?? "/dashboard";
  const fromState = from?.state;

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // True only when Supabase required email confirmation before a
  // session exists — the account was genuinely created, there just
  // isn't anyone to sign in as yet.
  const [confirmSent, setConfirmSent] = useState(false);

  const [googleBusy, setGoogleBusy] = useState(false);
  const [googleError, setGoogleError] = useState<string | null>(null);

  async function handleGoogle() {
    setGoogleBusy(true);
    setGoogleError(null);
    try {
      // Redirects the whole browser to Google and back to `fromPath`
      // directly — see LoginPage.tsx's own handleGoogle for why there
      // is no navigate() call after a successful one, and why fromState
      // can't ride along a real cross-domain redirect (BookingFlowPage's
      // sessionStorage fallback covers that case instead).
      await loginWithGoogle(`${window.location.origin}${fromPath}`);
    } catch (err) {
      setGoogleError(toUserMessage(err));
      setGoogleBusy(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }
    if (!agreed) {
      setError("Please accept the Terms and Privacy Policy to continue.");
      return;
    }

    setBusy(true);
    try {
      const user = await registerAndLoginWithEmail(email, password, { name, phone: phone || undefined });
      if (!user) {
        // Account created, but Supabase requires confirming the email
        // address first — there is no session to enter the app with.
        setConfirmSent(true);
        return;
      }
      navigate(fromPath, { replace: true, state: fromState });
    } catch (err) {
      setError(toUserMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mh-auth-split">
      <div className="mh-auth-split__brand">
        <Logo variant="full" height={72} />
        <h2 style={{ marginTop: "var(--space-lg)", fontSize: "var(--text-2xl)" }}>Create your account</h2>
        <p className="text-soft" style={{ marginTop: "var(--space-sm)", maxWidth: 360 }}>
          Save your family's details once, then book home collection or a lab visit in a couple of
          taps — with every report kept private and secure.
        </p>
      </div>

      <div className="mh-auth-split__card">
        <div style={{ display: "flex", justifyContent: "center", marginBottom: "var(--space-md)" }} className="mh-auth-split__mobile-logo">
          <Logo variant="full" height={56} />
        </div>

        <h1 style={{ fontSize: "var(--text-2xl)", marginBottom: 4, textAlign: "center" }}>Create account</h1>
        <p className="text-soft" style={{ textAlign: "center", marginBottom: "var(--space-md)", fontSize: "var(--text-sm)" }}>
          Book tests, track results, manage your family's health.
        </p>

        {confirmSent ? (
          <div className="card" style={{ textAlign: "center", display: "grid", gap: "var(--space-sm)" }}>
            <span className="mi" style={{ fontSize: 32, color: "var(--color-success)" }}>mark_email_read</span>
            <p style={{ fontWeight: 600 }}>Check your email</p>
            <p className="text-soft" style={{ fontSize: "var(--text-sm)" }}>
              We sent a confirmation link to {email}. Open it to activate your account, then log in.
            </p>
            <Link className="btn btn-primary" to="/login">Go to login</Link>
          </div>
        ) : (
          <>
            <button className="btn btn-outline" style={{ width: "100%" }} onClick={handleGoogle} disabled={googleBusy}>
              <span className="mi">account_circle</span> Continue with Google
            </button>
            {googleError && (
              <p style={{ color: "var(--color-danger)", fontSize: "var(--text-sm)", marginTop: 6 }}>{googleError}</p>
            )}

            <div className="text-soft" style={{ textAlign: "center", margin: "var(--space-md) 0" }}>
              or
            </div>

            <form onSubmit={handleSubmit} style={{ display: "grid", gap: "var(--space-sm)" }}>
          <label>
            Full name
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={{ width: "100%", padding: 10, borderRadius: "var(--radius-sm)", border: "1px solid var(--color-line)" }}
            />
          </label>
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
            Phone (optional)
            <input
              type="tel"
              inputMode="numeric"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              style={{ width: "100%", padding: 10, borderRadius: "var(--radius-sm)", border: "1px solid var(--color-line)" }}
            />
          </label>
          <label>
            Password
            <div style={{ position: "relative" }}>
              <input
                type={showPassword ? "text" : "password"}
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{ width: "100%", padding: "10px 40px 10px 10px", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-line)" }}
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer" }}
              >
                <span className="mi" style={{ fontSize: 20, color: "var(--color-ink-soft)" }}>
                  {showPassword ? "visibility_off" : "visibility"}
                </span>
              </button>
            </div>
          </label>
          <label>
            Confirm password
            <input
              type={showPassword ? "text" : "password"}
              required
              minLength={6}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              style={{ width: "100%", padding: 10, borderRadius: "var(--radius-sm)", border: "1px solid var(--color-line)" }}
            />
          </label>

          <label style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: "var(--text-sm)" }}>
            <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} style={{ marginTop: 3 }} />
            <span>
              I agree to the <Link to="/terms" style={{ color: "var(--color-primary)" }}>Terms</Link> and{" "}
              <Link to="/privacy" style={{ color: "var(--color-primary)" }}>Privacy Policy</Link>.
            </span>
          </label>

          {error && <p style={{ color: "var(--color-danger)", fontSize: "var(--text-sm)" }}>{error}</p>}

          <button className="btn btn-primary" type="submit" disabled={busy}>
            {busy ? "Creating account..." : "Create account"}
          </button>
            </form>
          </>
        )}

        <p className="text-soft" style={{ textAlign: "center", marginTop: "var(--space-md)", fontSize: "var(--text-sm)" }}>
          Already have an account? <Link to="/login" style={{ color: "var(--color-primary)", fontWeight: 600 }}>Log in</Link>
        </p>
      </div>
    </div>
  );
}
