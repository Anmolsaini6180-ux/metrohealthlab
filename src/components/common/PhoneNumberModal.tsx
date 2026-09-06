import { useState } from "react";
import { isValidIndianMobile, normalizeIndianMobile } from "@/utils/phone";

interface PhoneNumberModalProps {
  initialPhone?: string;
  title?: string;
  description?: string;
  onConfirm: (phone: string) => void;
  onCancel: () => void;
}

/**
 * The one place a customer confirms/changes the contact number for a
 * booking — opened as a modal (never an always-expanded section in the
 * booking flow itself) so the page stays short whether this is a
 * first-time ask or a quick edit of a number already on file. Same
 * fixed-overlay/.card visual language as ConfirmDialog.
 */
export default function PhoneNumberModal({ initialPhone = "", title, description, onConfirm, onCancel }: PhoneNumberModalProps) {
  const [phone, setPhone] = useState(initialPhone);
  const [touched, setTouched] = useState(false);
  const valid = isValidIndianMobile(phone);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.4)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 200,
        padding: "var(--space-md)",
      }}
      onClick={onCancel}
    >
      <div className="card" style={{ maxWidth: 380, width: "100%" }} onClick={(e) => e.stopPropagation()}>
        <p style={{ fontWeight: 700, marginBottom: 6, fontSize: "var(--text-lg)" }}>{title ?? "Your contact number"}</p>
        <p className="text-soft" style={{ fontSize: "var(--text-sm)", marginBottom: "var(--space-md)" }}>
          {description ?? "Our team will call this number about your booking — collection updates and anything that needs confirming."}
        </p>
        <label style={{ display: "grid", gap: 4 }}>
          <span style={{ fontWeight: 600, fontSize: "var(--text-sm)" }}>Mobile number</span>
          <div className="mh-pincode-row">
            <span className="mh-pincode-row__prefix">+91</span>
            <input
              className="mh-pincode-row__input"
              type="tel"
              inputMode="numeric"
              autoFocus
              placeholder="10-digit mobile number"
              value={phone}
              onChange={(e) => {
                setPhone(e.target.value);
                setTouched(true);
              }}
              maxLength={10}
            />
          </div>
        </label>
        {touched && phone.trim() !== "" && !valid && (
          <p style={{ color: "var(--color-danger)", fontSize: "var(--text-xs)", marginTop: 4 }}>
            Enter a valid 10-digit Indian mobile number.
          </p>
        )}
        <div style={{ display: "flex", gap: "var(--space-sm)", justifyContent: "flex-end", marginTop: "var(--space-md)" }}>
          <button className="btn btn-outline" type="button" onClick={onCancel}>
            Cancel
          </button>
          <button className="btn btn-primary" type="button" disabled={!valid} onClick={() => onConfirm(normalizeIndianMobile(phone))}>
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}
