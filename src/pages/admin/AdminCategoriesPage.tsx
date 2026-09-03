import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useAsync } from "@/hooks/useAsync";
import { useToast } from "@/hooks/useToast";
import { createTestCategory, getAllTestCategories, updateTestCategory } from "@/services/adminCatalogService";
import type { TestCategory } from "@/types/test";
import CategoryIcon from "@/components/common/CategoryIcon";
import IconPicker from "@/components/admin/IconPicker";
import ImagePicker from "@/components/admin/ImagePicker";
import LoadingState from "@/components/common/LoadingState";
import ErrorState from "@/components/common/ErrorState";
import EmptyState from "@/components/common/EmptyState";
import { toUserMessage } from "@/utils/errors";

export default function AdminCategoriesPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const categories = useAsync(getAllTestCategories, []);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<TestCategory | null>(null);

  async function handleToggleActive(cat: TestCategory) {
    if (!user) return;
    try {
      await updateTestCategory(user.uid, cat.id, { active: !cat.active });
      categories.retry();
    } catch (err) {
      console.error("Failed to change category status", err);
      showToast(toUserMessage(err), "error");
    }
  }

  return (
    <div>
      <div className="mh-page-head">
        <h1 style={{ fontSize: "var(--text-xl)" }}>Categories</h1>
        <button
          className="btn btn-primary"
          onClick={() => {
            setEditing(null);
            setShowCreate((s) => !s);
          }}
        >
          {showCreate ? "Cancel" : "+ Add category"}
        </button>
      </div>

      {showCreate && user && (
        <CategoryForm
          actorUid={user.uid}
          nextDisplayOrder={categories.data?.length ?? 0}
          onDone={() => {
            setShowCreate(false);
            showToast("Category created");
            categories.retry();
          }}
          onCancel={() => setShowCreate(false)}
        />
      )}

      {editing && user && (
        <CategoryForm
          key={editing.id}
          actorUid={user.uid}
          existing={editing}
          onDone={() => {
            setEditing(null);
            showToast("Category updated");
            categories.retry();
          }}
          onCancel={() => setEditing(null)}
        />
      )}

      {categories.loading && <LoadingState rows={3} />}
      {categories.error && <ErrorState message={categories.error} onRetry={categories.retry} />}
      {categories.data && categories.data.length === 0 && (
        <EmptyState icon="category" title="No categories yet" description="Add your first category above." />
      )}
      {categories.data && categories.data.length > 0 && (
        <div style={{ display: "grid", gap: "var(--space-sm)" }}>
          {categories.data.map((c) => (
            <div
              key={c.id}
              className="card"
              style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "var(--space-sm)" }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "var(--space-sm)", minWidth: 0 }}>
                {/* Older categories predate the icon field entirely, so
                    this renders a fallback rather than assuming one. */}
                <CategoryIcon iconName={c.icon} size={26} color="var(--color-primary)" />
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontWeight: 600 }}>
                    {c.name}{" "}
                    {!c.active && <span className="text-soft" style={{ fontSize: "var(--text-xs)" }}>(inactive)</span>}
                  </p>
                  <p className="text-soft" style={{ fontSize: "var(--text-sm)" }}>
                    {c.subtitle ? `${c.subtitle} • ` : ""}
                    /{c.slug}
                  </p>
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button
                  className="btn btn-outline"
                  onClick={() => {
                    setShowCreate(false);
                    setEditing(c);
                  }}
                >
                  Edit
                </button>
                <button className="btn btn-outline" onClick={() => handleToggleActive(c)}>
                  {c.active ? "Deactivate" : "Activate"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Mirrors the slug the seed function generates, so hand-made and
// imported categories end up with the same URL shape.
function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function CategoryForm({
  actorUid,
  existing,
  nextDisplayOrder,
  onDone,
  onCancel,
}: {
  actorUid: string;
  existing?: TestCategory;
  nextDisplayOrder?: number;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(existing?.name ?? "");
  const [slug, setSlug] = useState(existing?.slug ?? "");
  const [subtitle, setSubtitle] = useState(existing?.subtitle ?? "");
  // "" means "no icon" throughout the form; the service turns that into
  // an omitted field on create and a deleteField() on update.
  const [icon, setIcon] = useState(existing?.icon ?? "");
  const [slugTouched, setSlugTouched] = useState(Boolean(existing));
  const [pickerOpen, setPickerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (existing) {
        await updateTestCategory(actorUid, existing.id, { name, slug, subtitle, icon });
      } else {
        await createTestCategory(actorUid, {
          name,
          slug,
          subtitle,
          icon,
          active: true,
          displayOrder: nextDisplayOrder ?? 0,
        });
      }
      onDone();
    } catch (err) {
      // The technical error (Firestore code, rules rejection) goes to
      // the console; the admin sees the normalized message.
      console.error(existing ? "Failed to update category" : "Failed to create category", err);
      setError(toUserMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card" onSubmit={handleSubmit} style={{ display: "grid", gap: "var(--space-sm)", marginBottom: "var(--space-md)" }}>
      <p style={{ fontWeight: 700 }}>{existing ? `Edit “${existing.name}”` : "New category"}</p>

      <div className="mh-form-grid" style={{ marginBottom: 0 }}>
        <label>
          Category name
          <input
            placeholder="Blood Tests"
            required
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (!slugTouched) setSlug(slugify(e.target.value));
            }}
          />
        </label>

        <label>
          Slug
          <input
            placeholder="blood-tests"
            required
            value={slug}
            onChange={(e) => {
              setSlugTouched(true);
              setSlug(e.target.value);
            }}
          />
        </label>

        <label style={{ gridColumn: "1 / -1" }}>
          Discount / subtitle <span className="text-soft">(optional)</span>
          <input placeholder="Up to 70% off" value={subtitle} onChange={(e) => setSubtitle(e.target.value)} />
        </label>

        <div style={{ gridColumn: "1 / -1", display: "grid", gap: 4, fontSize: "var(--text-sm)" }}>
          <span>
            Icon <span className="text-soft">(optional)</span>
          </span>
          <div className="mh-icon-field">
            <span className="mh-icon-field__value">
              <CategoryIcon
                iconName={icon}
                size={24}
                color={icon ? "var(--color-primary)" : "var(--color-ink-soft)"}
              />
              <span className={icon ? undefined : "text-soft"}>{icon || "No icon selected"}</span>
            </span>
            <button type="button" className="btn btn-outline" onClick={() => setPickerOpen(true)}>
              {icon ? "Change icon" : "Choose icon"}
            </button>
            {icon && (
              <button type="button" className="btn btn-outline" onClick={() => setIcon("")}>
                Remove
              </button>
            )}
          </div>
          <span className="text-soft" style={{ fontSize: "var(--text-xs)" }}>
            Choose an icon to represent this category. Categories saved without one show a default icon.
          </span>
        </div>

        {existing && (
          <div style={{ gridColumn: "1 / -1" }}>
            <ImagePicker
              label="Category photo (optional)"
              category="tests"
              relatedId={existing.id}
              hint="Shown on the homepage category card instead of the icon once set. Leave unset to keep the icon."
            />
          </div>
        )}
      </div>

      {error && <p style={{ color: "var(--color-danger)", fontSize: "var(--text-sm)" }}>{error}</p>}

      <div style={{ display: "flex", gap: "var(--space-sm)", flexWrap: "wrap" }}>
        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? "Saving..." : existing ? "Save changes" : "Create category"}
        </button>
        <button className="btn btn-outline" type="button" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
      </div>

      {pickerOpen && (
        <IconPicker
          value={icon}
          onSelect={(picked) => setIcon(picked ?? "")}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </form>
  );
}
