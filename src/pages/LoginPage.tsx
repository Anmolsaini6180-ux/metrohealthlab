import { useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import type { ConfirmationResult, RecaptchaVerifier } from "firebase/auth";
import Logo from "@/components/brand/Logo";
import {
  createRecaptchaVerifier,
  loginWithEmail,
  loginWithGoogle,
  loginWithOtpConfirmation,
  sendOtp,
} from "@/services/authService";
import { toUserMessage } from "@/utils/errors";

type Mode = "email" | "phone";
type PhoneStep = "enter_phone" | "enter_otp";

const RECAPTCHA_CONTAINER_ID = "recaptcha-container";

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: Location })?.from?.pathname ?? "/dashboard";

  const [mode, setMode] = useState<Mode>("email");

  // ---- Email/password ----
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [emailBusy, setEmailBusy] = useState(false);

  const [googleBusy, setGoogleBusy] = useState(false);
  const [googleError, setGoogleError] = useState<string | null>(null);

  // ---- Phone / OTP ----
  const [phoneStep, setPhoneStep] = useState<PhoneStep>("enter_phone");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [otp, setOtp] = useState("");
  const [confirmation, setConfirmation] = useState<ConfirmationResult | null>(null);
  const [phoneBusy, setPhoneBusy] = useState(false);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const recaptchaVerifierRef = useRef<RecaptchaVerifier | null>(null);

  async function handleGoogle() {
    setGoogleBusy(true);
    setGoogleError(null);
    try {
      // Redirects the whole browser to Google and back to `from`
      // directly — there is no signed-in user to navigate with here
      // the way email/password has; a successful call never reaches
      // the line after it because the page has already navigated away.
      await loginWithGoogle(`${window.location.origin}${from}`);
    } catch (err) {
      setGoogleError(toUserMessage(err));
      setGoogleBusy(false);
    }
  }

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    setEmailBusy(true);
    setEmailError(null);
    try {
      await loginWithEmail(email, password);
      navigate(from, { replace: true });
    } catch (err) {
      setEmailError(toUserMessage(err));
    } finally {
      setEmailBusy(false);
    }
  }

  function getVerifier(): RecaptchaVerifier {
    if (!recaptchaVerifierRef.current) {
      recaptchaVerifierRef.current = createRecaptchaVerifier(RECAPTCHA_CONTAINER_ID);
    }
    return recaptchaVerifierRef.current;
  }

  function toE164(rawDigits: string): string {
    const digits = rawDigits.replace(/\D/g, "");
    return `+91${digits}`;
  }

  async function sendOtpNow() {
    setPhoneBusy(true);
    setPhoneError(null);
    try {
      const verifier = getVerifier();
      const result = await sendOtp(toE164(phoneNumber), verifier);
      setConfirmation(result);
      setOtp("");
      setPhoneStep("enter_otp");
    } catch (err) {
      setPhoneError(toUserMessage(err));
      recaptchaVerifierRef.current = null;
    } finally {
      setPhoneBusy(false);
    }
  }

  async function handleSendOtp(e: React.FormEvent) {
    e.preventDefault();
    await sendOtpNow();
  }

  async function handleResendOtp() {
    recaptchaVerifierRef.current = null;
    await sendOtpNow();
  }

  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault();
    if (!confirmation) return;
    setPhoneBusy(true);
    setPhoneError(null);
    try {
      await loginWithOtpConfirmation(confirmation, otp);
      navigate(from, { replace: true });
    } catch (err) {
      setPhoneError(toUserMessage(err));
    } finally {
      setPhoneBusy(false);
    }
  }

  function handleChangeNumber() {
    setPhoneStep("enter_phone");
    setOtp("");
    setConfirmation(null);
    setPhoneError(null);
  }

  return (
    <div className="mh-auth-split">
      <div className="mh-auth-split__brand">
        <Logo variant="full" height={72} />
        <h2 style={{ marginTop: "var(--space-lg)", fontSize: "var(--text-2xl)" }}>
          Accurate tests. Better health.
        </h2>
        <p className="text-soft" style={{ marginTop: "var(--space-sm)", maxWidth: 360 }}>
          Book diagnostic tests and health packages, track your sample in real time, and access
          your reports securely — all in one place.
        </p>
      </div>

      <div className="mh-auth-split__card">
        <div style={{ display: "flex", justifyContent: "center", marginBottom: "var(--space-md)" }} className="mh-auth-split__mobile-logo">
          <Logo variant="full" height={56} />
        </div>

        <h1 style={{ fontSize: "var(--text-2xl)", marginBottom: 4, textAlign: "center" }}>Welcome back</h1>
        <p className="text-soft" style={{ textAlign: "center", marginBottom: "var(--space-md)", fontSize: "var(--text-sm)" }}>
          Access your tests, bookings and health reports.
        </p>

        <button className="btn btn-outline" style={{ width: "100%" }} onClick={handleGoogle} disabled={googleBusy}>
          <span className="mi">account_circle</span> Continue with Google
        </button>
        {googleError && (
          <p style={{ color: "var(--color-danger)", fontSize: "var(--text-sm)", marginTop: 6 }}>{googleError}</p>
        )}

        <div className="text-soft" style={{ textAlign: "center", margin: "var(--space-md) 0" }}>
          or
        </div>

        <div style={{ display: "flex", gap: "var(--space-sm)", marginBottom: "var(--space-md)" }}>
          <button className={mode === "email" ? "btn btn-primary" : "btn btn-outline"} onClick={() => setMode("email")} style={{ flex: 1 }}>
            Email
          </button>
          <button className={mode === "phone" ? "btn btn-primary" : "btn btn-outline"} onClick={() => setMode("phone")} style={{ flex: 1 }}>
            Phone
          </button>
        </div>

        {mode === "email" && (
          <form onSubmit={handleEmailSubmit} style={{ display: "grid", gap: "var(--space-sm)" }}>
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

            <Link to="/forgot-password" style={{ fontSize: "var(--text-sm)", color: "var(--color-primary)", textAlign: "right" }}>
              Forgot password?
            </Link>

            {emailError && <p style={{ color: "var(--color-danger)", fontSize: "var(--text-sm)" }}>{emailError}</p>}

            <button className="btn btn-primary" type="submit" disabled={emailBusy}>
              {emailBusy ? "Please wait..." : "Log in"}
            </button>
          </form>
        )}

        {mode === "phone" && (
          <>
            {phoneStep === "enter_phone" && (
              <form onSubmit={handleSendOtp} style={{ display: "grid", gap: "var(--space-sm)" }}>
                <label>
                  Phone number
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span className="text-soft">+91</span>
                    <input
                      type="tel"
                      required
                      inputMode="numeric"
                      placeholder="10-digit mobile number"
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value)}
                      style={{ flex: 1, padding: 10, borderRadius: "var(--radius-sm)", border: "1px solid var(--color-line)" }}
                    />
                  </div>
                </label>
                {phoneError && <p style={{ color: "var(--color-danger)", fontSize: "var(--text-sm)" }}>{phoneError}</p>}
                <button className="btn btn-primary" type="submit" disabled={phoneBusy}>
                  {phoneBusy ? "Sending..." : "Send OTP"}
                </button>
              </form>
            )}

            {phoneStep === "enter_otp" && (
              <form onSubmit={handleVerifyOtp} style={{ display: "grid", gap: "var(--space-sm)" }}>
                <p className="text-soft" style={{ fontSize: "var(--text-sm)" }}>
                  Enter the code sent to +91{phoneNumber}
                </p>
                <label>
                  OTP
                  <input
                    type="text"
                    required
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value)}
                    style={{ width: "100%", padding: 10, borderRadius: "var(--radius-sm)", border: "1px solid var(--color-line)" }}
                  />
                </label>
                {phoneError && <p style={{ color: "var(--color-danger)", fontSize: "var(--text-sm)" }}>{phoneError}</p>}
                <button className="btn btn-primary" type="submit" disabled={phoneBusy}>
                  {phoneBusy ? "Verifying..." : "Verify OTP"}
                </button>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <button
                    type="button"
                    className="btn"
                    style={{ background: "transparent", color: "var(--color-primary)" }}
                    onClick={handleResendOtp}
                    disabled={phoneBusy}
                  >
                    Resend OTP
                  </button>
                  <button
                    type="button"
                    className="btn"
                    style={{ background: "transparent", color: "var(--color-ink-soft)" }}
                    onClick={handleChangeNumber}
                    disabled={phoneBusy}
                  >
                    Change number
                  </button>
                </div>
              </form>
            )}
          </>
        )}

        <p className="text-soft" style={{ textAlign: "center", marginTop: "var(--space-md)", fontSize: "var(--text-sm)" }}>
          Don't have an account? <Link to="/signup" style={{ color: "var(--color-primary)", fontWeight: 600 }}>Create account</Link>
        </p>
      </div>

      {/* Required by Firebase's invisible reCAPTCHA for phone auth — must
          be present in the DOM before createRecaptchaVerifier runs. */}
      <div id={RECAPTCHA_CONTAINER_ID} />
    </div>
  );
}
