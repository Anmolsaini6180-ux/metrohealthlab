import { useState } from "react";
import { useAsync } from "@/hooks/useAsync";
import { getAdminCustomers, getCustomerDetail } from "@/services/adminCustomerService";
import { formatCurrencyInr } from "@/services/pricingService";
import LoadingState from "@/components/common/LoadingState";
import ErrorState from "@/components/common/ErrorState";
import EmptyState from "@/components/common/EmptyState";

export default function AdminCustomersPage() {
  const [searchName, setSearchName] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [selectedUid, setSelectedUid] = useState<string | null>(null);

  const customers = useAsync(() => getAdminCustomers({ searchName: searchName || undefined }), [searchName]);
  const detail = useAsync(() => (selectedUid ? getCustomerDetail(selectedUid) : Promise.resolve(null)), [selectedUid]);

  return (
    <div>
      <h1 style={{ fontSize: "var(--text-xl)", marginBottom: "var(--space-md)" }}>Customers</h1>

      <form
        onSubmit={(e) => { e.preventDefault(); setSearchName(searchInput.trim()); }}
        style={{ display: "flex", gap: "var(--space-sm)", marginBottom: "var(--space-md)" }}
      >
        <input
          placeholder="Search by name..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          style={{ flex: 1, padding: 8, borderRadius: "var(--radius-sm)", border: "1px solid var(--color-line)" }}
        />
        <button className="btn btn-outline" type="submit">Search</button>
      </form>

      {customers.data?.approximate && (
        <p className="text-soft" style={{ fontSize: "var(--text-xs)", marginBottom: "var(--space-sm)" }}>
          Showing customers from your team's most recent bookings — very old customers outside that window may not appear.
        </p>
      )}

      {customers.loading && <LoadingState rows={3} />}
      {customers.error && <ErrorState message={customers.error} onRetry={customers.retry} />}
      {customers.data && customers.data.customers.length === 0 && <EmptyState icon="group" title="No customers found" />}

      <div className={selectedUid ? "mh-customer-split" : undefined} style={{ display: "grid", gap: "var(--space-lg)" }}>
        {customers.data && customers.data.customers.length > 0 && (
          <div style={{ display: "grid", gap: "var(--space-sm)", alignContent: "start" }}>
            {customers.data.customers.map((c) => (
              <button
                key={c.uid}
                className={selectedUid === c.uid ? "btn btn-primary" : "card"}
                style={{ textAlign: "left" }}
                onClick={() => setSelectedUid(c.uid)}
              >
                <p style={{ fontWeight: 600 }}>{c.name ?? "(no name)"}</p>
                <p className="text-soft" style={{ fontSize: "var(--text-sm)" }}>{c.email ?? c.phone ?? ""}</p>
              </button>
            ))}
          </div>
        )}

        {selectedUid && (
          <div>
            {detail.loading && <LoadingState label="Loading customer..." rows={3} />}
            {detail.error && <ErrorState message={detail.error} onRetry={detail.retry} />}
            {detail.data && (
              <div style={{ display: "grid", gap: "var(--space-md)" }}>
                <div className="card">
                  <p style={{ fontWeight: 700 }}>{detail.data.profile.name}</p>
                  <p className="text-soft" style={{ fontSize: "var(--text-sm)" }}>
                    {detail.data.profile.email} {detail.data.profile.phone ? `• ${detail.data.profile.phone}` : ""}
                  </p>
                </div>

                <div>
                  <h3 style={{ fontSize: "var(--text-sm)", fontWeight: 600, marginBottom: 6 }}>
                    Bookings ({detail.data.bookings.length})
                  </h3>
                  <div style={{ display: "grid", gap: 6 }}>
                    {detail.data.bookings.slice(0, 10).map((b) => (
                      <div key={b.id} className="card" style={{ padding: 8 }}>
                        <p style={{ fontSize: "var(--text-sm)", fontWeight: 600 }}>{b.id}</p>
                        <p className="text-soft" style={{ fontSize: "var(--text-xs)" }}>
                          {formatCurrencyInr(b.finalAmount)} • {b.bookingStatus} • {b.paymentStatus}
                        </p>
                      </div>
                    ))}
                    {detail.data.bookings.length === 0 && <p className="text-soft" style={{ fontSize: "var(--text-sm)" }}>No bookings yet</p>}
                  </div>
                </div>

                <div>
                  <h3 style={{ fontSize: "var(--text-sm)", fontWeight: 600, marginBottom: 6 }}>
                    Patients ({detail.data.patients.length})
                  </h3>
                  <p className="text-soft" style={{ fontSize: "var(--text-sm)" }}>
                    {detail.data.patients.map((p) => p.name).join(", ") || "None"}
                  </p>
                </div>

                <div>
                  <h3 style={{ fontSize: "var(--text-sm)", fontWeight: 600, marginBottom: 6 }}>
                    Addresses ({detail.data.addresses.length})
                  </h3>
                  <p className="text-soft" style={{ fontSize: "var(--text-sm)" }}>
                    {detail.data.addresses.map((a) => `${a.city} ${a.pincode}`).join(", ") || "None"}
                  </p>
                </div>

                <div>
                  <h3 style={{ fontSize: "var(--text-sm)", fontWeight: 600, marginBottom: 6 }}>
                    Reports ({detail.data.reports.length})
                  </h3>
                  <p className="text-soft" style={{ fontSize: "var(--text-sm)" }}>
                    {detail.data.reports.filter((r) => r.status === "ready").length} ready
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
