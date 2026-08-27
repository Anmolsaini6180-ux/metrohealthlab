import { useState } from "react";
import { useAsync } from "@/hooks/useAsync";
import { getAllPayments } from "@/services/adminOpsService";
import { formatCurrencyInr } from "@/services/pricingService";
import LoadingState from "@/components/common/LoadingState";
import ErrorState from "@/components/common/ErrorState";
import EmptyState from "@/components/common/EmptyState";

const STATUSES = ["pending", "processing", "success", "failed", "refunded", "cash_pending"];

export default function AdminPaymentsPage() {
  const [statusFilter, setStatusFilter] = useState("");
  const payments = useAsync(() => getAllPayments(statusFilter || undefined), [statusFilter]);

  return (
    <div>
      <h1 style={{ fontSize: "var(--text-xl)", marginBottom: "var(--space-md)" }}>Payments</h1>
      <p className="text-soft" style={{ fontSize: "var(--text-xs)", marginBottom: "var(--space-md)" }}>
        Read-only — payment success is only ever set by the signature-verified Razorpay webhook, never editable here.
      </p>

      <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ padding: 8, borderRadius: "var(--radius-sm)", border: "1px solid var(--color-line)", marginBottom: "var(--space-md)" }}>
        <option value="">All statuses</option>
        {STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
      </select>

      {payments.loading && <LoadingState rows={4} />}
      {payments.error && <ErrorState message={payments.error} onRetry={payments.retry} />}
      {payments.data && payments.data.length === 0 && <EmptyState icon="payments" title="No payments found" />}
      {payments.data && payments.data.length > 0 && (
        <div style={{ display: "grid", gap: "var(--space-sm)" }}>
          {payments.data.map((p) => (
            <div key={p.id} className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
              <div>
                <p style={{ fontWeight: 600 }}>Booking {p.bookingId}</p>
                <p className="text-soft" style={{ fontSize: "var(--text-sm)" }}>{p.method.replace(/_/g, " ")}</p>
              </div>
              <div style={{ textAlign: "right" }}>
                <p style={{ fontWeight: 600 }}>{formatCurrencyInr(p.amount)}</p>
                <p className="text-soft" style={{ fontSize: "var(--text-sm)" }}>{p.status.replace(/_/g, " ")}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
