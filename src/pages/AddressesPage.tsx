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
        <h1 style={{ fontSize: "var(--text-2xl)" }}>Addresses</h1>
        <button
          className="btn btn-primary"
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
        <div style={{ display: "grid", gap: "var(--space-sm)", marginTop: "var(--space-md)" }}>
          {addresses.data.map((a) => (
            <div key={a.id} className="card">
              <p style={{ fontWeight: 600 }}>
                {a.label} {a.isDefault && <span className="text-soft" style={{ fontSize: "var(--text-xs)" }}>(default)</span>}
              </p>
              <p className="text-soft" style={{ fontSize: "var(--text-sm)" }}>
                {a.house}, {a.street}, {a.area}, {a.city}, {a.state} {a.pincode}
              </p>
              <div style={{ display: "flex", gap: "var(--space-sm)", marginTop: "var(--space-sm)" }}>
                {!a.isDefault && (
                  <button className="btn btn-outline" onClick={() => handleSetDefault(a.id)}>
                    Set default
                  </button>
                )}
                <button
                  className="btn btn-outline"
                  onClick={() => {
                    setShowForm(false);
                    setEditingAddress(a);
                  }}
                >
                  Edit
                </button>
                <button className="btn btn-outline" onClick={() => handleDelete(a.id)}>
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
    <form className="card" onSubmit={handleSubmit} style={{ display: "grid", gap: "var(--space-sm)", marginBottom: "var(--space-md)" }}>
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
        <button className="btn btn-primary" type="submit" disabled={busy} style={{ flex: 1 }}>
          {busy ? "Saving..." : editAddress ? "Save changes" : "Save address"}
        </button>
        <button className="btn btn-outline" type="button" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
      </div>
    </form>
  );
}
