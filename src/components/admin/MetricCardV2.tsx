import { Link } from "react-router-dom";
import type { MetricTone } from "./MetricCard";

/**
 * Design-system-v2 sibling of MetricCard — same tone/muted contract,
 * new .mh2-metric-card* styling (admin-shell.css). MetricCard itself
 * stays untouched: AdminFinancePage and AdminBookingDashboardPage
 * still use it and aren't part of this pass yet.
 */
export default function MetricCardV2({
  icon,
  label,
  value,
  to,
  tone,
  muted,
}: {
  icon: string;
  label: string;
  value: string | number;
  to?: string;
  tone?: MetricTone;
  muted?: boolean;
}) {
  const className = `mh2-metric-card${tone ? ` mh2-metric-card--${tone}` : ""}${muted ? " mh2-metric-card--muted" : ""}`;
  const content = (
    <>
      <span className="mh2-metric-card__icon" aria-hidden="true">
        <span className="mi">{icon}</span>
      </span>
      <span className="mh2-metric-card__body">
        <span className="mh2-metric-card__value">{value}</span>
        <span className="mh2-metric-card__label">{label}</span>
      </span>
    </>
  );
  return to ? (
    <Link to={to} className={className}>
      {content}
    </Link>
  ) : (
    <div className={className}>{content}</div>
  );
}
