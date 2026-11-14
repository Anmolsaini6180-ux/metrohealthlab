import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { searchTests } from "@/services/testService";
import { searchPackages } from "@/services/packageService";

const RECENT_KEY = "mh_recent_searches";
const MAX_RECENT = 5;
const DEBOUNCE_MS = 250;
const MAX_RESULTS_PER_KIND = 5;

/** localStorage can throw in private-browsing mode — losing the
 * "recent searches" convenience is never worth crashing search over. */
function loadRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

function saveRecent(term: string): string[] {
  const trimmed = term.trim();
  if (!trimmed) return loadRecent();
  try {
    const existing = loadRecent().filter((t) => t.toLowerCase() !== trimmed.toLowerCase());
    const next = [trimmed, ...existing].slice(0, MAX_RECENT);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
    return next;
  } catch {
    return loadRecent();
  }
}

interface ResultItem {
  kind: "test" | "package";
  id: string;
  slug: string;
  name: string;
  price: number;
}

/**
 * Real, live autocomplete over the actual catalog (searchTests/
 * searchPackages — both already existed, just never wired into a
 * dropdown before this). Debounced network calls, full keyboard
 * navigation, an honest no-results state, and a "recent searches" list
 * (this browser only, never fabricated "popular searches" — there is
 * no real search-volume data to back that claim yet).
 *
 * Used by both the desktop and mobile header search — one component,
 * one behaviour, styled via the className/inputClassName props rather
 * than duplicated markup per breakpoint.
 */
export default function SearchAutocomplete({
  id,
  placeholder,
  className,
  inputClassName,
}: {
  id: string;
  placeholder: string;
  className?: string;
  inputClassName?: string;
}) {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<ResultItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [recent, setRecent] = useState<string[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setRecent(loadRecent());
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    const trimmed = q.trim();
    if (!trimmed) {
      setResults([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const [packages, tests] = await Promise.all([searchPackages(trimmed), searchTests(trimmed)]);
        if (cancelled) return;
        setResults([
          ...packages.slice(0, MAX_RESULTS_PER_KIND).map((p) => ({ kind: "package" as const, id: p.id, slug: p.slug, name: p.name, price: p.sellingPrice })),
          ...tests.slice(0, MAX_RESULTS_PER_KIND).map((t) => ({ kind: "test" as const, id: t.id, slug: t.slug, name: t.name, price: t.sellingPrice })),
        ]);
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [q]);

  function goToResult(item: ResultItem) {
    setRecent(saveRecent(item.name));
    setOpen(false);
    setQ("");
    setActiveIndex(-1);
    navigate(item.kind === "test" ? `/tests/${item.slug}` : `/packages/${item.slug}`);
  }

  function submitFreeText(term: string) {
    const trimmed = term.trim();
    if (!trimmed) return;
    setRecent(saveRecent(trimmed));
    setOpen(false);
    setActiveIndex(-1);
    navigate(`/tests?q=${encodeURIComponent(trimmed)}`);
  }

  const showingRecent = q.trim() === "" && recent.length > 0;
  const activeList: Array<ResultItem | string> = showingRecent ? recent : results;

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActiveIndex((i) => Math.min(i + 1, activeList.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, -1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const picked = activeIndex >= 0 ? activeList[activeIndex] : undefined;
      if (typeof picked === "string") submitFreeText(picked);
      else if (picked) goToResult(picked);
      else submitFreeText(q);
    } else if (e.key === "Escape") {
      setOpen(false);
      setActiveIndex(-1);
    }
  }

  return (
    <div className={`mh-search-auto${className ? ` ${className}` : ""}`} ref={containerRef}>
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          submitFreeText(q);
        }}
      >
        <label className="visually-hidden" htmlFor={id}>
          {placeholder}
        </label>
        <div className="mh-search-auto__input-wrap">
          <span className="mi mh-search-auto__icon" aria-hidden="true">
            search
          </span>
          <input
            id={id}
            type="search"
            autoComplete="off"
            placeholder={placeholder}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setOpen(true);
              setActiveIndex(-1);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={handleKeyDown}
            className={inputClassName}
            role="combobox"
            aria-expanded={open}
            aria-controls={`${id}-listbox`}
            aria-autocomplete="list"
          />
        </div>
      </form>

      {open && (showingRecent || q.trim() !== "") && (
        <div className="mh-search-auto__panel" id={`${id}-listbox`} role="listbox">
          {showingRecent && (
            <>
              <p className="mh-search-auto__section-label">Recent searches</p>
              {recent.map((term, i) => (
                <button
                  key={term}
                  type="button"
                  role="option"
                  aria-selected={activeIndex === i}
                  className={`mh-search-auto__item${activeIndex === i ? " is-active" : ""}`}
                  onMouseDown={() => submitFreeText(term)}
                >
                  <span className="mi" aria-hidden="true">
                    history
                  </span>
                  <span className="mh-search-auto__item-name">{term}</span>
                </button>
              ))}
            </>
          )}

          {!showingRecent && loading && <p className="mh-search-auto__status">Searching…</p>}

          {!showingRecent && !loading && results.length === 0 && (
            <p className="mh-search-auto__status">
              No tests or packages match "{q.trim()}".{" "}
              <button type="button" className="mh-search-auto__link" onMouseDown={() => submitFreeText(q)}>
                See all results
              </button>
            </p>
          )}

          {!showingRecent &&
            !loading &&
            results.map((item, i) => (
              <button
                key={`${item.kind}-${item.id}`}
                type="button"
                role="option"
                aria-selected={activeIndex === i}
                className={`mh-search-auto__item${activeIndex === i ? " is-active" : ""}`}
                onMouseDown={() => goToResult(item)}
              >
                <span className={`mh-search-auto__item-kind mh-search-auto__item-kind--${item.kind}`}>
                  {item.kind === "package" ? "Package" : "Test"}
                </span>
                <span className="mh-search-auto__item-name">{item.name}</span>
                <span className="mh-search-auto__item-price">₹{item.price.toLocaleString("en-IN")}</span>
              </button>
            ))}
        </div>
      )}
    </div>
  );
}

export { loadRecent, saveRecent };
