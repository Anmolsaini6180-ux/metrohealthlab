import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useAsync } from "@/hooks/useAsync";
import { addAddress, deleteAddress, getAddresses, setDefaultAddress, updateAddress } from "@/services/addressService";
import type { Address } from "@/types/address";
import LoadingState from "@/components/common/LoadingState";
import ErrorState from "@/components/common/ErrorState";
import EmptyState from "@/components/common/EmptyState";
import { toUserMessage } from "@/utils/errors";

export default function AddressesPage() {
  // addresses.user_id is a Supabase uuid FK to profiles.id — never
  // the Firebase user.uid (see src/supabase/identity.ts).
  const { supabaseUserId } = useAuth();
  const addresses = useAsync(() => (supabaseUserId ? getAddresses(supabaseUserId) : Promise.resolve([])), [supabaseUserId]);
  const [showForm, setShowForm] = useState(false);
  const [editingAddress, setEditingAddress] = useState<Address | null>(null);

  async function handleDelete(id: string) {
    await deleteAddress(id);
    addresses.retry();
  }

  async function handleSetDefault(id: string) {
    if (!supabaseUserId) return;
    await setDefaultAddress(supabaseUserId, id);
    addresses.retry();
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-md)" }}>
        <h1 className="mh2-dashboard__section-title" style={{ fontSize: "var(--text-2xl)" }}>Addresses</h1>
        <button
          className="mh2-btn mh2-btn--primary"
          onClick={() => {
            setEditingAddress(null);
            setShowForm((s) => !s);
          }}
        >
          {showForm ? "Cancel" : "+ Add"}
        </button>
      </div>

      {(showForm || editingAddress) && supabaseUserId && (
        <AddAddressForm
          key={editingAddress?.id ?? "new"}
          userId={supabaseUserId}
          editAddress={editingAddress ?? undefined}
          onAdded={() => {
            setShowForm(false);
            setEditingAddress(null);
            addresses.retry();
          }}
          onCancel={() => {
            setShowForm(false);
            setEditingAddress(null);
          }}
        />
      )}

      {addresses.loading && !addresses.data && <LoadingState rows={2} />}
      {addresses.error && <ErrorState message={addresses.error} onRetry={addresses.retry} />}
      {addresses.data && addresses.data.length === 0 && !showForm && (
        <EmptyState icon="location_on" title="No saved addresses yet" />
      )}
      {addresses.data && addresses.data.length > 0 && (
        <div className="mh2-list" style={{ marginTop: "var(--space-md)" }}>
          {addresses.data.map((a) => (
            <div key={a.id} className="mh2-card">
              <p style={{ fontWeight: 700 }}>
                {a.label} {a.isDefault && <em style={{ fontStyle: "normal", fontWeight: 600, fontSize: 11, color: "var(--color-primary)", marginLeft: 6 }}>Default</em>}
              </p>
              <p className="text-soft" style={{ fontSize: "var(--text-sm)" }}>
                {a.house}, {a.street}, {a.area}, {a.city}, {a.state} {a.pincode}
              </p>
              <div style={{ display: "flex", gap: "var(--space-sm)", marginTop: "var(--space-sm)", flexWrap: "wrap" }}>
                {!a.isDefault && (
                  <button className="mh2-btn mh2-btn--outline mh2-btn--sm" onClick={() => handleSetDefault(a.id)}>
                    Set default
                  </button>
                )}
                <button
                  className="mh2-btn mh2-btn--outline mh2-btn--sm"
                  onClick={() => {
                    setShowForm(false);
                    setEditingAddress(a);
                  }}
                >
                  Edit
                </button>
                <button className="mh2-btn mh2-btn--outline mh2-btn--sm" onClick={() => handleDelete(a.id)}>
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AddAddressForm({
  userId,
  editAddress,
  onAdded,
  onCancel,
}: {
  userId: string;
  editAddress?: Address;
  onAdded: () => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState(() =>
    editAddress
      ? {
          label: editAddress.label,
          house: editAddress.house,
          street: editAddress.street,
          area: editAddress.area,
          city: editAddress.city,
          state: editAddress.state,
          pincode: editAddress.pincode,
          landmark: editAddress.landmark ?? "",
        }
      : { label: "Home", house: "", street: "", area: "", city: "", state: "", pincode: "", landmark: "" }
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function update<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (editAddress) {
        await updateAddress(editAddress.id, form);
      } else {
        await addAddress(userId, form);
      }
      onAdded();
    } catch (err) {
      setError(toUserMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="mh2-card" onSubmit={handleSubmit} style={{ display: "grid", gap: "var(--space-sm)", marginBottom: "var(--space-md)" }}>
      <input placeholder="Label (Home / Work)" required value={form.label} onChange={(e) => update("label", e.target.value)} />
      <input placeholder="House / flat no." required value={form.house} onChange={(e) => update("house", e.target.value)} />
      <input placeholder="Street" required value={form.street} onChange={(e) => update("street", e.target.value)} />
      <input placeholder="Area" required value={form.area} onChange={(e) => update("area", e.target.value)} />
      <input placeholder="City" required value={form.city} onChange={(e) => update("city", e.target.value)} />
      <input placeholder="State" required value={form.state} onChange={(e) => update("state", e.target.value)} />
      <input placeholder="Pincode" required value={form.pincode} onChange={(e) => update("pincode", e.target.value)} />
      <input placeholder="Landmark (optional)" value={form.landmark} onChange={(e) => update("landmark", e.target.value)} />
      {error && <p style={{ color: "var(--color-danger)", fontSize: "var(--text-sm)" }}>{error}</p>}
      <div style={{ display: "flex", gap: "var(--space-sm)" }}>
        <button className="mh2-btn mh2-btn--primary" type="submit" disabled={busy} style={{ flex: 1 }}>
          {busy ? "Saving..." : editAddress ? "Save changes" : "Save address"}
        </button>
        <button className="mh2-btn mh2-btn--outline" type="button" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
      </div>
    </form>
  );
}
