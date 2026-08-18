import { Check, ChevronDown, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

export type SearchSelectOption = {
  value: string;
  label: string;
  meta?: string;
};

export function SearchSelect({
  label,
  value,
  options,
  onChange,
  placeholder,
  searchPlaceholder = "Search…",
  disabled = false,
}: {
  label: string;
  value: string;
  options: SearchSelectOption[];
  onChange: (value: string) => void;
  placeholder: string;
  searchPlaceholder?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement | null>(null);
  const selected = options.find((option) => option.value === value) ?? null;

  useEffect(() => {
    if (!open) return;
    const handlePointer = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("pointerdown", handlePointer);
    window.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("pointerdown", handlePointer);
      window.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return options;
    return options.filter((option) => `${option.label} ${option.meta ?? ""}`.toLowerCase().includes(normalized));
  }, [options, query]);

  return (
    <label className="block">
      <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.08em] text-text-muted">{label}</span>
      <div ref={rootRef} className="relative">
        <button
          type="button"
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={() => setOpen((current) => !current)}
          className="flex min-h-11 w-full items-center justify-between gap-3 rounded-md border border-border bg-background px-3 text-left text-sm font-bold text-text-primary outline-none transition-colors hover:border-[rgba(124,58,237,0.65)] focus:border-accent focus:ring-2 focus:ring-[rgba(124,58,237,0.32)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span className="min-w-0 truncate">{selected?.label ?? placeholder}</span>
          <ChevronDown aria-hidden={true} size={16} className={`shrink-0 text-text-muted transition-transform ${open ? "rotate-180" : ""}`} />
        </button>

        {open && !disabled && (
          <div className="absolute left-0 right-0 z-[70] mt-1 overflow-hidden rounded-lg border border-border bg-surface shadow-2xl">
            {options.length > 5 && (
              <div className="border-b border-border p-2">
                <div className="flex min-h-10 items-center gap-2 rounded-md border border-border bg-background px-2.5">
                  <Search aria-hidden={true} size={15} className="text-text-muted" />
                  <input
                    autoFocus
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder={searchPlaceholder}
                    className="min-w-0 flex-1 bg-transparent text-sm text-text-primary outline-none placeholder:text-text-muted"
                  />
                </div>
              </div>
            )}
            <div role="listbox" className="max-h-[280px] overflow-y-auto p-1">
              {!filtered.length ? (
                <div className="px-3 py-4 text-center text-xs text-text-muted">No matches.</div>
              ) : filtered.map((option) => {
                const active = option.value === value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="option"
                    aria-selected={active}
                    onClick={() => {
                      onChange(option.value);
                      setOpen(false);
                    }}
                    className={`grid min-h-[44px] w-full grid-cols-[minmax(0,1fr)_20px] items-center gap-3 rounded-md px-3 text-left transition-colors ${active ? "bg-[rgba(124,58,237,0.16)]" : "hover:bg-surface-elevated"}`}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-bold">{option.label}</span>
                      {option.meta && <span className="block truncate text-[10px] text-text-muted">{option.meta}</span>}
                    </span>
                    {active && <Check aria-hidden={true} size={15} className="text-[#c4b5fd]" />}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </label>
  );
}
