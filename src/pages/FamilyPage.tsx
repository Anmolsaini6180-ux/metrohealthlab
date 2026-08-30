import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useAsync } from "@/hooks/useAsync";
import { addPatient, deletePatient, getPatients } from "@/services/patientService";
import type { PatientRelationship } from "@/types/patient";
import LoadingState from "@/components/common/LoadingState";
import ErrorState from "@/components/common/ErrorState";
import EmptyState from "@/components/common/EmptyState";
import { toUserMessage } from "@/utils/errors";

const RELATIONSHIPS: PatientRelationship[] = ["self", "father", "mother", "spouse", "son", "daughter", "other"];

export default function FamilyPage() {
  // patients.user_id is a Supabase uuid FK to profiles.id — never the
  // Firebase user.uid (see src/supabase/identity.ts).
  const { supabaseUserId } = useAuth();
  const patients = useAsync(() => (supabaseUserId ? getPatients(supabaseUserId) : Promise.resolve([])), [supabaseUserId]);
  const [showForm, setShowForm] = useState(false);

  async function handleDelete(id: string) {
    await deletePatient(id);
    patients.retry();
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-md)" }}>
        <h1 style={{ fontSize: "var(--text-2xl)" }}>Family members</h1>
        <button className="btn btn-primary" onClick={() => setShowForm((s) => !s)}>
          {showForm ? "Cancel" : "+ Add"}
        </button>
      </div>

      {showForm && supabaseUserId && (
        <AddPatientForm
          userId={supabaseUserId}
          onAdded={() => {
            setShowForm(false);
            patients.retry();
          }}
        />
      )}

      {patients.loading && <LoadingState rows={2} />}
      {patients.error && <ErrorState message={patients.error} onRetry={patients.retry} />}
      {patients.data && patients.data.length === 0 && !showForm && (
        <EmptyState icon="group" title="No family members added yet" />
      )}
      {patients.data && patients.data.length > 0 && (
        <div style={{ display: "grid", gap: "var(--space-sm)", marginTop: "var(--space-md)" }}>
          {patients.data.map((p) => (
            <div key={p.id} className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <p style={{ fontWeight: 600 }}>{p.name}</p>
                <p className="text-soft" style={{ fontSize: "var(--text-sm)" }}>{p.relationship} • {p.gender}</p>
              </div>
              <button className="btn btn-outline" onClick={() => handleDelete(p.id)}>
                Remove
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AddPatientForm({ userId, onAdded }: { userId: string; onAdded: () => void }) {
  const [name, setName] = useState("");
  const [relationship, setRelationship] = useState<PatientRelationship>("self");
  const [dob, setDob] = useState("");
  const [gender, setGender] = useState<"male" | "female" | "other">("male");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await addPatient(userId, { name, relationship, dob, gender });
      onAdded();
    } catch (err) {
      setError(toUserMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card" onSubmit={handleSubmit} style={{ display: "grid", gap: "var(--space-sm)", marginBottom: "var(--space-md)" }}>
      <input placeholder="Full name" required value={name} onChange={(e) => setName(e.target.value)} />
      <select value={relationship} onChange={(e) => setRelationship(e.target.value as PatientRelationship)}>
        {RELATIONSHIPS.map((r) => (
          <option key={r} value={r}>
            {r}
          </option>
        ))}
      </select>
      <input type="date" required value={dob} onChange={(e) => setDob(e.target.value)} />
      <select value={gender} onChange={(e) => setGender(e.target.value as typeof gender)}>
        <option value="male">Male</option>
        <option value="female">Female</option>
        <option value="other">Other</option>
      </select>
      {error && <p style={{ color: "var(--color-danger)", fontSize: "var(--text-sm)" }}>{error}</p>}
      <button className="btn btn-primary" type="submit" disabled={busy}>
        Save
      </button>
    </form>
  );
}
