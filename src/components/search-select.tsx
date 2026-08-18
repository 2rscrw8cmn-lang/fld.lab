import { Check, ChevronDown, Search } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { cn } from "@/lib/utils";

export type SearchSelectOption = {
  value: string;
  label: string;
  meta?: string;
};

type MenuPosition = {
  left: number;
  top?: number;
  bottom?: number;
  width: number;
  maxHeight: number;
};

export function SearchSelect({
  label,
  value,
  options,
  onChange,
  placeholder,
  searchPlaceholder = "Search…",
  disabled = false,
  hideLabel = false,
  searchable,
  className,
  triggerClassName,
}: {
  label: string;
  value: string;
  options: SearchSelectOption[];
  onChange: (value: string) => void;
  placeholder: string;
  searchPlaceholder?: string;
  disabled?: boolean;
  hideLabel?: boolean;
  searchable?: boolean;
  className?: string;
  triggerClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(-1);
  const [menuPosition, setMenuPosition] = useState<MenuPosition | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const keyboardOpenRef = useRef(false);
  const selected = options.find((option) => option.value === value) ?? null;
  const shouldSearch = searchable ?? options.length > 5;

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return options;
    return options.filter((option) => `${option.label} ${option.meta ?? ""}`.toLowerCase().includes(normalized));
  }, [options, query]);

  const selectedFilteredIndex = Math.max(0, filtered.findIndex((option) => option.value === value));

  const closeMenu = (restoreFocus = false) => {
    setOpen(false);
    keyboardOpenRef.current = false;
    if (restoreFocus) window.requestAnimationFrame(() => triggerRef.current?.focus());
  };

  const updateMenuPosition = () => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const margin = 8;
    const gap = 4;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const width = Math.min(rect.width, Math.max(220, viewportWidth - margin * 2));
    const left = Math.min(Math.max(margin, rect.left), Math.max(margin, viewportWidth - width - margin));
    const below = viewportHeight - rect.bottom - margin;
    const above = rect.top - margin;
    const openAbove = below < 220 && above > below;
    const available = Math.max(140, (openAbove ? above : below) - gap);

    setMenuPosition({
      left,
      width,
      maxHeight: Math.min(360, available),
      ...(openAbove
        ? { bottom: Math.max(margin, viewportHeight - rect.top + gap) }
        : { top: Math.min(viewportHeight - margin, rect.bottom + gap) }),
    });
  };

  useEffect(() => {
    if (!open) return;
    const handlePointer = (event: PointerEvent) => {
      const target = event.target as Node;
      const insideRoot = rootRef.current?.contains(target);
      const insideMenu = menuRef.current?.contains(target);
      if (!insideRoot && !insideMenu) closeMenu(false);
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeMenu(true);
      }
    };
    const handleViewportChange = () => updateMenuPosition();

    window.addEventListener("pointerdown", handlePointer);
    window.addEventListener("keydown", handleKey);
    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);
    return () => {
      window.removeEventListener("pointerdown", handlePointer);
      window.removeEventListener("keydown", handleKey);
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;
    updateMenuPosition();

    const nextIndex = Math.min(selectedFilteredIndex, Math.max(filtered.length - 1, 0));
    setActiveIndex(filtered.length ? nextIndex : -1);
    window.requestAnimationFrame(() => {
      if (keyboardOpenRef.current || !shouldSearch) optionRefs.current[nextIndex]?.focus();
      else searchRef.current?.focus();
    });
  }, [open]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setMenuPosition(null);
    }
  }, [open]);

  useEffect(() => {
    if (disabled && open) closeMenu(false);
  }, [disabled, open]);

  useEffect(() => {
    if (!open) return;
    const nextIndex = filtered.length ? Math.min(Math.max(activeIndex, 0), filtered.length - 1) : -1;
    if (nextIndex !== activeIndex) setActiveIndex(nextIndex);
  }, [activeIndex, filtered.length, open]);

  const focusOption = (index: number) => {
    if (!filtered.length) return;
    const next = (index + filtered.length) % filtered.length;
    setActiveIndex(next);
    window.requestAnimationFrame(() => optionRefs.current[next]?.focus());
  };

  const chooseOption = (option: SearchSelectOption) => {
    onChange(option.value);
    closeMenu(true);
  };

  const handleOptionKey = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      focusOption(index + 1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      focusOption(index - 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      focusOption(0);
    } else if (event.key === "End") {
      event.preventDefault();
      focusOption(filtered.length - 1);
    }
  };

  const menu = open && !disabled && menuPosition
    ? createPortal(
        <div
          ref={menuRef}
          className="z-[100] flex overflow-hidden rounded-lg border border-border bg-surface shadow-2xl"
          style={{
            position: "fixed",
            left: menuPosition.left,
            top: menuPosition.top,
            bottom: menuPosition.bottom,
            width: menuPosition.width,
            maxHeight: menuPosition.maxHeight,
          }}
        >
          <div className="flex min-h-0 flex-1 flex-col">
            {shouldSearch && (
              <div className="border-b border-border p-2">
                <div className="flex min-h-10 items-center gap-2 rounded-md border border-border bg-background px-2.5 focus-within:ring-2 focus-within:ring-[rgba(124,58,237,0.32)]">
                  <Search aria-hidden={true} size={15} className="text-text-muted" />
                  <input
                    ref={searchRef}
                    value={query}
                    onChange={(event) => {
                      setQuery(event.target.value);
                      setActiveIndex(0);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "ArrowDown") {
                        event.preventDefault();
                        focusOption(0);
                      } else if (event.key === "ArrowUp") {
                        event.preventDefault();
                        focusOption(filtered.length - 1);
                      }
                    }}
                    placeholder={searchPlaceholder}
                    aria-label={searchPlaceholder}
                    className="min-w-0 flex-1 bg-transparent text-sm text-text-primary outline-none placeholder:text-text-muted"
                  />
                </div>
              </div>
            )}
            <div role="listbox" aria-label={label} className="min-h-0 flex-1 overflow-y-auto p-1">
              {!filtered.length ? (
                <div className="px-3 py-4 text-center text-xs text-text-muted">No matches.</div>
              ) : filtered.map((option, index) => {
                const selectedOption = option.value === value;
                return (
                  <button
                    key={option.value}
                    ref={(node) => { optionRefs.current[index] = node; }}
                    type="button"
                    role="option"
                    tabIndex={-1}
                    aria-selected={selectedOption}
                    onFocus={() => setActiveIndex(index)}
                    onKeyDown={(event) => handleOptionKey(event, index)}
                    onClick={() => chooseOption(option)}
                    className={cn(
                      "grid min-h-[44px] w-full grid-cols-[minmax(0,1fr)_20px] items-center gap-3 rounded-md px-3 text-left outline-none transition-colors hover:bg-surface-elevated focus:bg-surface-elevated focus:ring-2 focus:ring-inset focus:ring-[rgba(124,58,237,0.42)]",
                      selectedOption && "bg-[rgba(124,58,237,0.16)]",
                    )}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-bold">{option.label}</span>
                      {option.meta && <span className="block truncate text-[10px] text-text-muted">{option.meta}</span>}
                    </span>
                    {selectedOption && <Check aria-hidden={true} size={15} className="text-[#c4b5fd]" />}
                  </button>
                );
              })}
            </div>
          </div>
        </div>,
        document.body,
      )
    : null;

  return (
    <div className={cn("block", className)}>
      <span className={hideLabel ? "sr-only" : "mb-1.5 block text-[10px] font-bold uppercase tracking-[0.08em] text-text-muted"}>{label}</span>
      <div ref={rootRef}>
        <button
          ref={triggerRef}
          type="button"
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label={`${label}: ${selected?.label ?? placeholder}`}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              keyboardOpenRef.current = true;
              setOpen(true);
              setActiveIndex(event.key === "ArrowUp" ? Math.max(options.length - 1, 0) : Math.max(options.findIndex((option) => option.value === value), 0));
            }
          }}
          onClick={() => {
            keyboardOpenRef.current = false;
            setOpen((current) => !current);
          }}
          className={cn(
            "flex min-h-11 w-full items-center justify-between gap-3 rounded-md border border-border bg-background px-3 text-left text-sm font-bold text-text-primary outline-none transition-colors hover:border-[rgba(124,58,237,0.65)] focus:border-accent focus:ring-2 focus:ring-[rgba(124,58,237,0.32)] disabled:cursor-not-allowed disabled:opacity-50",
            triggerClassName,
          )}
        >
          <span className="min-w-0 truncate">{selected?.label ?? placeholder}</span>
          <ChevronDown aria-hidden={true} size={16} className={`shrink-0 text-text-muted transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
      </div>
      {menu}
    </div>
  );
}
