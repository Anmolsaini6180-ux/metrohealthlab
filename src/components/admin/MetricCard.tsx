import { Link } from "react-router-dom";

export type MetricTone = "success" | "warning" | "danger" | "accent";

/**
 * Shared by AdminDashboardPage and AdminFinancePage (and anywhere else
 * that wants the same treatment) so the two can't visually drift apart
 * — an icon badge tinted by real meaning (green = good/money in,
 * amber = pending/outflow, red = cancelled, muted = secondary
 * reference data) instead of a wall of identical neutral boxes. See
 * .mh-metric-card in admin-shell.css for the actual styling.
 */
export default function MetricCard({
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
  /** When set, the whole card is a link — e.g. through to the filtered list this number was counted from. */
  to?: string;
  tone?: MetricTone;
  muted?: boolean;
}) {
  const className = `mh-metric-card${tone ? ` mh-metric-card--${tone}` : ""}${muted ? " mh-metric-card--muted" : ""}`;
  const content = (
    <>
      <span className="mh-metric-card__icon" aria-hidden="true">
        <span className="mi">{icon}</span>
      </span>
      <span className="mh-metric-card__body">
        <span className="mh-metric-card__value">{value}</span>
        <span className="mh-metric-card__label">{label}</span>
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
