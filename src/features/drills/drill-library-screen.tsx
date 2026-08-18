import { useEffect, useMemo, useState, type ComponentType } from "react";
import {
  Activity,
  ArrowLeftRight,
  ArrowUp,
  ChevronRight,
  Crosshair,
  Flag,
  Gauge,
  Hand,
  Hash,
  Import,
  Move,
  Navigation,
  RefreshCw,
  Repeat2,
  Route,
  Search,
  Send,
  Star,
  Timer,
  TimerReset,
  Triangle,
  X,
  Zap,
} from "lucide-react";

import { SearchSelect } from "@/components/search-select";
import { Button } from "@/components/ui/button";
import {
  ApiError,
  getDrill,
  importDrill,
  listDrills,
  type Drill,
  type DrillDefinition,
  type DrillDetail,
  type MeasurementType,
} from "@/lib/api";

const iconRegistry: Record<string, ComponentType<{ size?: number; className?: string; "aria-hidden"?: boolean }>> = {
  timer: Timer,
  sprint: Gauge,
  speed: Gauge,
  agility: Move,
  shuttle: ArrowLeftRight,
  route: Route,
  catch: Hand,
  accuracy: Crosshair,
  throw: Send,
  flag: Flag,
  pursuit: Navigation,
  jump: ArrowUp,
  power: Zap,
  reps: Repeat2,
  count: Hash,
  rating: Star,
  cone: Triangle,
  stopwatch: TimerReset,
};

const measurementLabels: Record<MeasurementType, string> = {
  time: "Time",
  successes_attempts: "Success / attempts",
  distance: "Distance",
  count: "Count",
  rating: "Rating",
  custom_numeric: "Numeric",
};

function DrillIcon({ drill, size = 18 }: { drill: Drill; size?: number }) {
  const categoryKey = drill.category.toLowerCase();
  const Icon = iconRegistry[drill.icon ?? ""] ?? iconRegistry[categoryKey] ?? Activity;
  return <Icon aria-hidden={true} size={size} />;
}

function joinValues(values?: string[]) {
  return values?.length ? values.join(", ") : "—";
}

function attemptLabel(definition: DrillDefinition) {
  const count = definition.attempts.count;
  return `${count} ${count === 1 ? "attempt" : "attempts"} · ${definition.attempts.result}`;
}

function DetailValue({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 border-b border-border py-3 last:border-b-0 sm:grid-cols-[130px_minmax(0,1fr)] sm:gap-4">
      <dt className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-text-muted">{label}</dt>
      <dd className="min-w-0 text-xs leading-5 text-text-secondary">{children}</dd>
    </div>
  );
}

export function DrillLibraryScreen() {
  const [drills, setDrills] = useState<Drill[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [measurementType, setMeasurementType] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<DrillDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [importOpen, setImportOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    setLoadError("");
    try {
      setDrills(await listDrills());
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Could not load drills.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      setDetailError("");
      return;
    }

    let cancelled = false;
    setDetailLoading(true);
    setDetailError("");
    getDrill(selectedId)
      .then((value) => { if (!cancelled) setDetail(value); })
      .catch((error) => {
        if (!cancelled) setDetailError(error instanceof Error ? error.message : "Could not load drill.");
      })
      .finally(() => { if (!cancelled) setDetailLoading(false); });

    return () => { cancelled = true; };
  }, [selectedId]);

  const categories = useMemo(
    () => Array.from(new Set(drills.map((drill) => drill.category))).sort((a, b) => a.localeCompare(b)),
    [drills],
  );

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return drills.filter((drill) => {
      if (category !== "all" && drill.category !== category) return false;
      if (measurementType !== "all" && drill.measurement_type !== measurementType) return false;
      if (!normalized) return true;
      return [drill.name, drill.slug, drill.category, measurementLabels[drill.measurement_type]]
        .some((value) => value.toLowerCase().includes(normalized));
    });
  }, [category, drills, measurementType, query]);

  const handleImported = async (result: DrillDetail) => {
    setImportOpen(false);
    await load();
    setSelectedId(result.drill.id);
    setDetail(result);
  };

  return (
    <section className="mx-auto max-w-[1160px] px-4 pb-7 pt-[18px] md:px-7 md:pt-[22px]">
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[23px] font-extrabold leading-[1.08] tracking-[-0.035em] md:text-[29px]">Drills</h1>
          <p className="mt-1 text-[13px] text-text-muted">Configure the tests and skill work you run in the field.</p>
        </div>
        <Button type="button" onClick={() => setImportOpen(true)} className="min-h-10 gap-2 text-xs font-bold">
          <Import aria-hidden={true} size={16} />
          Import Drill
        </Button>
      </header>

      <section className="overflow-hidden rounded-[11px] border border-border bg-surface">
        <div className="grid gap-2 border-b border-border p-3 sm:grid-cols-[minmax(220px,1fr)_170px_180px]">
          <label className="relative block">
            <span className="sr-only">Search drills</span>
            <Search aria-hidden={true} size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search drills"
              className="min-h-11 w-full rounded-md border border-border bg-background pl-9 pr-3 text-xs text-text-primary outline-none transition-colors placeholder:text-text-muted focus:border-accent"
            />
          </label>
          <SearchSelect
            label="Filter by category"
            hideLabel
            value={category}
            options={[{ value: "all", label: "All categories" }, ...categories.map((value) => ({ value, label: value }))]}
            onChange={setCategory}
            placeholder="All categories"
            searchable={false}
            triggerClassName="text-xs font-semibold"
          />
          <SearchSelect
            label="Filter by measurement type"
            hideLabel
            value={measurementType}
            options={[
              { value: "all", label: "All measurements" },
              ...Object.entries(measurementLabels).map(([value, label]) => ({ value, label })),
            ]}
            onChange={setMeasurementType}
            placeholder="All measurements"
            searchable={false}
            triggerClassName="text-xs font-semibold"
          />
        </div>

        {loading ? (
          <div aria-label="Loading drills">
            {[0, 1, 2, 3].map((item) => <div key={item} className="h-[58px] animate-pulse border-b border-border bg-surface-elevated/30 last:border-b-0" />)}
          </div>
        ) : loadError ? (
          <div className="flex min-h-[180px] flex-col items-center justify-center gap-3 p-6 text-center">
            <p className="text-sm font-bold">Couldn’t load the drill library.</p>
            <p className="max-w-md text-xs text-text-muted">{loadError}</p>
            <Button type="button" variant="secondary" onClick={() => void load()} className="gap-2 text-xs">
              <RefreshCw aria-hidden={true} size={15} /> Retry
            </Button>
          </div>
        ) : drills.length === 0 ? (
          <div className="flex min-h-[220px] flex-col items-center justify-center gap-3 p-6 text-center">
            <Activity aria-hidden={true} size={28} className="text-text-muted" />
            <div>
              <p className="text-sm font-bold">No drills yet.</p>
              <p className="mt-1 max-w-md text-xs leading-5 text-text-muted">Import a drill definition to build this library. fld.LAB does not invent drills when the database is empty.</p>
            </div>
            <Button type="button" onClick={() => setImportOpen(true)} className="gap-2 text-xs font-bold">
              <Import aria-hidden={true} size={15} /> Import first drill
            </Button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-6 text-center text-xs text-text-muted">No drills match these filters.</div>
        ) : (
          <div>
            {filtered.map((drill) => (
              <button
                key={drill.id}
                type="button"
                onClick={() => setSelectedId(drill.id)}
                className="grid min-h-[58px] w-full grid-cols-[34px_minmax(0,1fr)_auto_18px] items-center gap-2 border-b border-border px-3 text-left transition-colors last:border-b-0 hover:bg-surface-elevated sm:grid-cols-[34px_minmax(220px,1.5fr)_minmax(110px,.7fr)_minmax(120px,.75fr)_70px_18px] sm:gap-3 sm:px-4"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-background text-text-muted">
                  <DrillIcon drill={drill} />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-xs font-extrabold">{drill.name}</span>
                  <span className="block truncate text-[10px] text-text-muted sm:hidden">{drill.category} · {measurementLabels[drill.measurement_type]}</span>
                </span>
                <span className="hidden truncate text-[11px] font-bold text-text-muted sm:block">{drill.category}</span>
                <span className="hidden truncate text-[11px] text-text-muted sm:block">{measurementLabels[drill.measurement_type]}</span>
                <span className="text-[10px] font-bold tabular-nums text-text-muted">v{drill.current_version}</span>
                <ChevronRight aria-hidden={true} size={15} className="text-text-muted" />
              </button>
            ))}
          </div>
        )}
      </section>

      {selectedId && (
        <DetailPanel
          loading={detailLoading}
          error={detailError}
          detail={detail}
          onClose={() => setSelectedId(null)}
          onRetry={() => {
            const id = selectedId;
            setSelectedId(null);
            window.setTimeout(() => setSelectedId(id), 0);
          }}
        />
      )}

      {importOpen && <ImportPanel onClose={() => setImportOpen(false)} onImported={handleImported} />}
    </section>
  );
}

function DetailPanel({
  loading,
  error,
  detail,
  onClose,
  onRetry,
}: {
  loading: boolean;
  error: string;
  detail: DrillDetail | null;
  onClose: () => void;
  onRetry: () => void;
}) {
  const definition = detail?.version.definition;

  return (
    <div className="fixed inset-0 z-50 bg-black/55" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}>
      <aside className="ml-auto flex h-full w-full max-w-[560px] flex-col border-l border-border bg-background shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="drill-detail-title">
        <div className="flex min-h-[58px] items-center justify-between gap-3 border-b border-border px-4">
          <div className="min-w-0">
            <div className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-text-muted">Drill preview</div>
            <h2 id="drill-detail-title" className="truncate text-sm font-extrabold">{detail?.drill.name ?? "Loading drill…"}</h2>
          </div>
          <button type="button" aria-label="Close drill preview" onClick={onClose} className="flex h-10 w-10 items-center justify-center rounded-md text-text-muted hover:bg-surface hover:text-text-primary">
            <X aria-hidden={true} size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-5">
          {loading ? (
            <div className="space-y-3">
              {[0, 1, 2, 3, 4].map((item) => <div key={item} className="h-12 animate-pulse rounded-md bg-surface" />)}
            </div>
          ) : error ? (
            <div className="flex min-h-[220px] flex-col items-center justify-center gap-3 text-center">
              <p className="text-sm font-bold">Couldn’t load this drill.</p>
              <p className="text-xs text-text-muted">{error}</p>
              <Button type="button" variant="secondary" onClick={onRetry} className="text-xs">Retry</Button>
            </div>
          ) : detail && definition ? (
            <>
              <div className="mb-5 flex items-start gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-border bg-surface text-text-muted">
                  <DrillIcon drill={detail.drill} size={22} />
                </span>
                <div className="min-w-0">
                  <h3 className="text-xl font-extrabold tracking-[-0.03em]">{detail.drill.name}</h3>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <span className="rounded-full border border-[rgba(124,58,237,0.42)] bg-[rgba(124,58,237,0.14)] px-2.5 py-1 text-[10px] font-bold text-[#c4b5fd]">{detail.drill.category}</span>
                    <span className="rounded-full border border-border px-2.5 py-1 text-[10px] font-bold text-text-muted">{measurementLabels[detail.drill.measurement_type]}</span>
                    <span className="rounded-full border border-border px-2.5 py-1 text-[10px] font-bold text-text-muted">v{detail.version.version}</span>
                  </div>
                </div>
              </div>

              {definition.description && <p className="mb-5 text-sm leading-6 text-text-secondary">{definition.description}</p>}

              <dl className="border-y border-border">
                <DetailValue label="Attempts">{attemptLabel(definition)}</DetailValue>
                <DetailValue label="Direction">{definition.measurement.direction}</DetailValue>
                <DetailValue label="Timer">{definition.timer?.enabled ? "Enabled" : "Not used"}</DetailValue>
                {definition.timer?.splits?.length ? <DetailValue label="Splits">{definition.timer.splits.map((split) => split.label).join(", ")}</DetailValue> : null}
                <DetailValue label="Positions">{joinValues(definition.positions)}</DetailValue>
                <DetailValue label="Equipment">{joinValues(definition.equipment)}</DetailValue>
                <DetailValue label="Tags">{joinValues(definition.tags)}</DetailValue>
                {definition.setup?.distance_yards ? <DetailValue label="Distance">{definition.setup.distance_yards} yd</DetailValue> : null}
              </dl>

              {definition.instructions && (
                <div className="mt-5">
                  <h4 className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-text-muted">Instructions</h4>
                  <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-text-secondary">{definition.instructions}</p>
                </div>
              )}

              {definition.setup?.notes && (
                <div className="mt-5">
                  <h4 className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-text-muted">Setup notes</h4>
                  <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-text-secondary">{definition.setup.notes}</p>
                </div>
              )}
            </>
          ) : null}
        </div>
      </aside>
    </div>
  );
}

function ImportPanel({ onClose, onImported }: { onClose: () => void; onImported: (result: DrillDetail) => void | Promise<void> }) {
  const [source, setSource] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});

  const submit = async () => {
    setError("");
    setFields({});

    let parsed: unknown;
    try {
      parsed = JSON.parse(source);
    } catch {
      setError("This is not valid JSON. Fix the JSON and try again.");
      return;
    }

    setSubmitting(true);
    try {
      const result = await importDrill(parsed);
      await onImported(result);
    } catch (caught) {
      if (caught instanceof ApiError) {
        setError(caught.message);
        setFields(caught.fields ?? {});
      } else {
        setError(caught instanceof Error ? caught.message : "Could not import this drill.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black/55" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}>
      <aside className="ml-auto flex h-full w-full max-w-[620px] flex-col border-l border-border bg-background shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="import-drill-title">
        <div className="flex min-h-[58px] items-center justify-between gap-3 border-b border-border px-4">
          <div>
            <div className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-text-muted">Drill configuration</div>
            <h2 id="import-drill-title" className="text-sm font-extrabold">Import JSON</h2>
          </div>
          <button type="button" aria-label="Close import" onClick={onClose} className="flex h-10 w-10 items-center justify-center rounded-md text-text-muted hover:bg-surface hover:text-text-primary">
            <X aria-hidden={true} size={18} />
          </button>
        </div>

        <div className="flex flex-1 flex-col overflow-y-auto p-4 sm:p-5">
          <p className="mb-3 text-xs leading-5 text-text-muted">Paste a schema-version 1 drill definition. The server validates behavior and creates a new immutable version when an existing slug changes.</p>
          <label className="flex min-h-0 flex-1 flex-col">
            <span className="mb-2 text-[10px] font-extrabold uppercase tracking-[0.08em] text-text-muted">Definition JSON</span>
            <textarea
              value={source}
              onChange={(event) => setSource(event.target.value)}
              spellCheck={false}
              placeholder={'{\n  "schema_version": 1,\n  "slug": "20-yard-sprint",\n  ...\n}'}
              className="min-h-[340px] flex-1 resize-none rounded-md border border-border bg-surface p-3 font-mono text-[11px] leading-5 text-text-primary outline-none placeholder:text-text-muted focus:border-accent"
            />
          </label>

          {error && (
            <div className="mt-3 rounded-md border border-danger/40 bg-danger/10 p-3">
              <p className="text-xs font-bold text-danger">{error}</p>
              {Object.keys(fields).length > 0 && (
                <div className="mt-2 space-y-1">
                  {Object.entries(fields).map(([field, message]) => (
                    <div key={field} className="grid gap-1 text-[11px] sm:grid-cols-[170px_minmax(0,1fr)]">
                      <span className="font-mono text-text-muted">{field}</span>
                      <span className="text-text-secondary">{message}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-border p-4">
          <Button type="button" variant="secondary" onClick={onClose} disabled={submitting} className="text-xs">Cancel</Button>
          <Button type="button" onClick={() => void submit()} disabled={submitting || !source.trim()} className="gap-2 text-xs font-bold">
            <Import aria-hidden={true} size={15} /> {submitting ? "Importing…" : "Import Drill"}
          </Button>
        </div>
      </aside>
    </div>
  );
}
