import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useAsync } from "@/hooks/useAsync";
import { addPatient, deletePatient, getPatients, updatePatient } from "@/services/patientService";
import type { Patient, PatientRelationship } from "@/types/patient";
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
  const [editingPatient, setEditingPatient] = useState<Patient | null>(null);

  async function handleDelete(id: string) {
    await deletePatient(id);
    patients.retry();
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-md)" }}>
        <h1 style={{ fontSize: "var(--text-2xl)" }}>Family members</h1>
        <button
          className="btn btn-primary"
          onClick={() => {
            setEditingPatient(null);
            setShowForm((s) => !s);
          }}
        >
          {showForm ? "Cancel" : "+ Add"}
        </button>
      </div>

      {(showForm || editingPatient) && supabaseUserId && (
        <AddPatientForm
          key={editingPatient?.id ?? "new"}
          userId={supabaseUserId}
          editPatient={editingPatient ?? undefined}
          onAdded={() => {
            setShowForm(false);
            setEditingPatient(null);
            patients.retry();
          }}
          onCancel={() => {
            setShowForm(false);
            setEditingPatient(null);
          }}
        />
      )}

      {patients.loading && !patients.data && <LoadingState rows={2} />}
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
              <div style={{ display: "flex", gap: "var(--space-sm)" }}>
                <button
                  className="btn btn-outline"
                  onClick={() => {
                    setShowForm(false);
                    setEditingPatient(p);
                  }}
                >
                  Edit
                </button>
                <button className="btn btn-outline" onClick={() => handleDelete(p.id)}>
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

function AddPatientForm({
  userId,
  editPatient,
  onAdded,
  onCancel,
}: {
  userId: string;
  editPatient?: Patient;
  onAdded: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(editPatient?.name ?? "");
  const [relationship, setRelationship] = useState<PatientRelationship>(editPatient?.relationship ?? "self");
  const [dob, setDob] = useState(editPatient?.dob ?? "");
  const [gender, setGender] = useState<"male" | "female" | "other">(editPatient?.gender ?? "male");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (editPatient) {
        await updatePatient(editPatient.id, { name, relationship, dob, gender });
      } else {
        await addPatient(userId, { name, relationship, dob, gender });
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
      <div style={{ display: "flex", gap: "var(--space-sm)" }}>
        <button className="btn btn-primary" type="submit" disabled={busy} style={{ flex: 1 }}>
          {busy ? "Saving..." : editPatient ? "Save changes" : "Save"}
        </button>
        <button className="btn btn-outline" type="button" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
      </div>
    </form>
  );
}
