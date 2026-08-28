import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import CategoryIcon from "@/components/common/CategoryIcon";
import {
  CATEGORY_ICON_GROUPS,
  normalizeIconName,
  searchCategoryIcons,
  type CategoryIconGroup,
  type CategoryIconOption,
} from "@/data/categoryIcons";

interface IconPickerProps {
  /** The icon currently saved on the record, if any. */
  value?: string;
  /** Called with the chosen ligature name, or `undefined` for "no icon". */
  onSelect: (iconName: string | undefined) => void;
  onClose: () => void;
  title?: string;
}

// Modal icon browser for the admin catalog screens.
//
// Rendered through a portal on purpose: the picker is opened from
// inside a <form>, and a nested form (or a stray Enter keypress in the
// search box) would otherwise submit the category form underneath it.
export default function IconPicker({ value, onSelect, onClose, title = "Choose category icon" }: IconPickerProps) {
  const [query, setQuery] = useState("");
  const [pending, setPending] = useState<string | undefined>(() => normalizeIconName(value));
  const searchRef = useRef<HTMLInputElement>(null);

  const results = useMemo(() => searchCategoryIcons(query), [query]);
  const searching = query.trim().length > 0;

  // Group the matches so the full catalog reads as sections; a search
  // collapses to one flat, ranked-by-catalog-order grid.
  const grouped = useMemo(() => {
    const byGroup = new Map<CategoryIconGroup, CategoryIconOption[]>();
    for (const icon of results) {
      const bucket = byGroup.get(icon.group);
      if (bucket) bucket.push(icon);
      else byGroup.set(icon.group, [icon]);
    }
    return CATEGORY_ICON_GROUPS.filter((group) => byGroup.has(group)).map(
      (group) => [group, byGroup.get(group) ?? []] as const
    );
  }, [results]);

  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  // Escape closes, and the page behind the overlay must not scroll away
  // under the dialog on mobile.
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  function commit() {
    onSelect(pending);
    onClose();
  }

  function renderTile(icon: CategoryIconOption) {
    const selected = pending === icon.name;
    return (
      <button
        key={icon.name}
        type="button"
        className={`mh-icon-picker__tile${selected ? " is-selected" : ""}`}
        aria-pressed={selected}
        title={icon.label}
        onClick={() => setPending(icon.name)}
        onDoubleClick={commit}
      >
        <CategoryIcon iconName={icon.name} size={26} />
        <span className="mh-icon-picker__tile-name">{icon.name}</span>
      </button>
    );
  }

  return createPortal(
    <div
      className="mh-icon-picker"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
    >
      <div className="mh-icon-picker__panel card" onClick={(e) => e.stopPropagation()}>
        <div className="mh-icon-picker__head">
          <p style={{ fontWeight: 700 }}>{title}</p>
          <button type="button" className="icon-btn" aria-label="Close icon picker" onClick={onClose}>
            <span className="mi">close</span>
          </button>
        </div>

        <input
          ref={searchRef}
          type="search"
          placeholder="Search icons — blood, heart, offer, report..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          // The picker lives inside the category form; Enter here must
          // never bubble up and submit it.
          onKeyDown={(e) => {
            if (e.key === "Enter") e.preventDefault();
          }}
        />

        <div className="mh-icon-picker__body">
          <div className="mh-icon-picker__grid">
            <button
              type="button"
              className={`mh-icon-picker__tile${pending === undefined ? " is-selected" : ""}`}
              aria-pressed={pending === undefined}
              title="Save this category without an icon"
              onClick={() => setPending(undefined)}
            >
              <span className="mi mi-safe" style={{ fontSize: 26, width: 26, height: 26, color: "var(--color-ink-soft)" }} aria-hidden="true">
                block
              </span>
              <span className="mh-icon-picker__tile-name">No icon</span>
            </button>
            {searching && results.map(renderTile)}
          </div>

          {!searching &&
            grouped.map(([group, icons]) => (
              <section key={group}>
                <p className="mh-icon-picker__group">{group}</p>
                <div className="mh-icon-picker__grid">{icons.map(renderTile)}</div>
              </section>
            ))}

          {searching && results.length === 0 && (
            <p className="text-soft" style={{ fontSize: "var(--text-sm)", padding: "var(--space-md) 0" }}>
              No icons match “{query.trim()}”. Try a broader word such as “blood”, “heart” or “report”.
            </p>
          )}
        </div>

        <div className="mh-icon-picker__foot">
          <div className="mh-icon-picker__preview">
            <CategoryIcon iconName={pending} size={22} color="var(--color-primary)" />
            <span style={{ fontSize: "var(--text-sm)", fontWeight: 600 }}>{pending ?? "No icon"}</span>
          </div>
          <div className="mh-icon-picker__actions">
            <button type="button" className="btn btn-outline" onClick={() => setPending(undefined)} disabled={pending === undefined}>
              Clear
            </button>
            <button type="button" className="btn btn-outline" onClick={onClose}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary" onClick={commit}>
              Select
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
