import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Archive, Pencil, Plus, RotateCcw, Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  ApiError,
  createRosterMember,
  getRoster,
  patchAthlete,
  patchMembership,
  type RosterRow,
  type Team,
} from "@/lib/api";

type FormState = {
  first_name: string;
  last_name: string;
  birth_year: string;
  notes: string;
  jersey_number: string;
  primary_position: string;
  secondary_position: string;
};

const EMPTY_FORM: FormState = {
  first_name: "",
  last_name: "",
  birth_year: "",
  notes: "",
  jersey_number: "",
  primary_position: "",
  secondary_position: "",
};

function formFromRow(row: RosterRow): FormState {
  return {
    first_name: row.athlete.first_name,
    last_name: row.athlete.last_name,
    birth_year: row.athlete.birth_year?.toString() ?? "",
    notes: row.athlete.notes ?? "",
    jersey_number: row.membership.jersey_number ?? "",
    primary_position: row.membership.primary_position ?? "",
    secondary_position: row.membership.secondary_position ?? "",
  };
}

function positions(row: RosterRow) {
  return [row.membership.primary_position, row.membership.secondary_position].filter(Boolean).join(" / ") || "—";
}

function teamLabel(team: Team | null) {
  if (!team) return "No team selected";
  return [team.name, team.season_label].filter(Boolean).join(" — ");
}

export function RosterScreen({ team, onNavigate }: { team: Team | null; onNavigate: (path: string) => void }) {
  const [rows, setRows] = useState<RosterRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [editorRow, setEditorRow] = useState<RosterRow | null | undefined>(undefined);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const loadRoster = useCallback(async () => {
    if (!team) {
      setRows([]);
      setLoadError(null);
      return;
    }

    setLoading(true);
    setLoadError(null);
    try {
      setRows(await getRoster(team.id, showArchived));
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Could not load the roster.");
    } finally {
      setLoading(false);
    }
  }, [showArchived, team]);

  useEffect(() => {
    void loadRoster();
  }, [loadRoster]);

  useEffect(() => {
    setSearch("");
    setEditorRow(undefined);
  }, [team?.id]);

  const filteredRows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((row) =>
      [
        row.athlete.first_name,
        row.athlete.last_name,
        row.membership.jersey_number,
        row.membership.primary_position,
        row.membership.secondary_position,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(needle),
    );
  }, [rows, search]);

  const openAdd = () => {
    setEditorRow(null);
    setForm(EMPTY_FORM);
    setSaveError(null);
  };

  const openEdit = (row: RosterRow) => {
    setEditorRow(row);
    setForm(formFromRow(row));
    setSaveError(null);
  };

  const closeEditor = () => {
    if (saving) return;
    setEditorRow(undefined);
    setSaveError(null);
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!team) return;

    const firstName = form.first_name.trim();
    const lastName = form.last_name.trim();
    if (!firstName || !lastName) {
      setSaveError("First and last name are required.");
      return;
    }

    const birthYearText = form.birth_year.trim();
    const birthYear = birthYearText ? Number(birthYearText) : null;
    const currentYear = new Date().getUTCFullYear();
    if (birthYear !== null && (!Number.isInteger(birthYear) || birthYear < 1900 || birthYear > currentYear)) {
      setSaveError("Enter a valid birth year.");
      return;
    }

    const athlete = {
      first_name: firstName,
      last_name: lastName,
      birth_year: birthYear,
      notes: form.notes.trim() || null,
    };
    const membership = {
      jersey_number: form.jersey_number.trim() || null,
      primary_position: form.primary_position.trim() || null,
      secondary_position: form.secondary_position.trim() || null,
    };

    setSaving(true);
    setSaveError(null);
    try {
      if (editorRow) {
        await patchAthlete(editorRow.athlete.id, athlete);
        await patchMembership(editorRow.membership.id, membership);
      } else {
        await createRosterMember(team.id, athlete, membership);
      }
      setEditorRow(undefined);
      await loadRoster();
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        setSaveError("That athlete is already on this team.");
      } else {
        setSaveError(error instanceof Error ? error.message : "Could not save the athlete. Try again.");
      }
    } finally {
      setSaving(false);
    }
  };

  const toggleMembership = async (row: RosterRow) => {
    const archiving = row.membership.active;
    if (archiving && !window.confirm(`Archive ${row.athlete.first_name} ${row.athlete.last_name} from this roster? Historical results will be preserved.`)) {
      return;
    }

    try {
      await patchMembership(row.membership.id, { active: !archiving });
      await loadRoster();
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Could not update roster status.");
    }
  };

  return (
    <section className="mx-auto max-w-[1160px] px-4 pb-8 pt-[18px] md:px-7 md:pt-[22px]">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-[23px] font-extrabold leading-[1.08] tracking-[-0.035em] md:text-[29px]">Roster</h1>
          <p className="mt-1 text-[13px] text-text-muted">{teamLabel(team)}</p>
        </div>
        <Button type="button" onClick={openAdd} disabled={!team} className="gap-2 self-start sm:self-auto">
          <Plus aria-hidden="true" size={17} />
          Add Athlete
        </Button>
      </div>

      {!team ? (
        <div className="mt-5 rounded-[11px] border border-border bg-surface p-6">
          <h2 className="text-sm font-bold">No active team</h2>
          <p className="mt-1 text-sm text-text-muted">Create or activate a team before adding athletes to a roster.</p>
        </div>
      ) : (
        <div className="mt-5 overflow-hidden rounded-[11px] border border-border bg-surface">
          <div className="flex flex-col gap-3 border-b border-border p-3 sm:flex-row sm:items-center sm:justify-between">
            <label className="relative block min-w-0 flex-1 sm:max-w-[360px]">
              <span className="sr-only">Search roster</span>
              <Search aria-hidden="true" size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search name, #, or position"
                className="h-10 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-sm outline-none placeholder:text-text-muted focus-visible:ring-2 focus-visible:ring-accent"
              />
            </label>
            <label className="flex min-h-10 cursor-pointer items-center gap-2 text-xs font-semibold text-text-muted">
              <input
                type="checkbox"
                checked={showArchived}
                onChange={(event) => setShowArchived(event.target.checked)}
                className="h-4 w-4 accent-accent"
              />
              Show archived
            </label>
          </div>

          {loading ? (
            <div aria-label="Loading roster" className="divide-y divide-border">
              {[0, 1, 2, 3, 4].map((item) => <div key={item} className="h-12 animate-pulse bg-surface-elevated/40" />)}
            </div>
          ) : loadError ? (
            <div className="p-6">
              <h2 className="text-sm font-bold">Roster unavailable</h2>
              <p className="mt-1 text-sm text-text-muted">{loadError}</p>
              <Button type="button" variant="secondary" className="mt-4" onClick={() => void loadRoster()}>Retry</Button>
            </div>
          ) : rows.length === 0 ? (
            <div className="p-6">
              <h2 className="text-sm font-bold">{showArchived ? "No roster records yet" : "No active athletes yet"}</h2>
              <p className="mt-1 text-sm text-text-muted">Add the first athlete without leaving this screen.</p>
              <Button type="button" className="mt-4 gap-2" onClick={openAdd}><Plus aria-hidden="true" size={17} />Add Athlete</Button>
            </div>
          ) : filteredRows.length === 0 ? (
            <div className="p-6 text-sm text-text-muted">No athletes match “{search}”.</div>
          ) : (
            <div>
              <div className="hidden h-9 grid-cols-[64px_minmax(180px,1fr)_minmax(130px,.8fr)_100px] items-center gap-3 border-b border-border px-3 text-[10px] font-bold uppercase tracking-[0.08em] text-text-muted sm:grid">
                <span>#</span><span>Athlete</span><span>Positions</span><span className="text-right">Actions</span>
              </div>
              {filteredRows.map((row) => (
                <div
                  key={row.membership.id}
                  className={`grid min-h-12 grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-2 border-b border-border px-3 last:border-b-0 sm:grid-cols-[64px_minmax(180px,1fr)_minmax(130px,.8fr)_100px] sm:gap-3 ${row.membership.active ? "" : "opacity-55"}`}
                >
                  <span className="text-xs font-extrabold tabular-nums text-text-muted">{row.membership.jersey_number || "—"}</span>
                  <button type="button" onClick={() => onNavigate(`/athletes/${encodeURIComponent(row.athlete.id)}`)} className="min-w-0 py-2 text-left transition-colors hover:text-[#c4b5fd]">
                    <span className="block truncate text-sm font-bold">{row.athlete.first_name} {row.athlete.last_name}</span>
                    <span className="block truncate text-[11px] text-text-muted sm:hidden">{positions(row)}{!row.membership.active ? " · Archived" : ""}</span>
                  </button>
                  <span className="hidden truncate text-xs font-semibold text-text-muted sm:block">{positions(row)}</span>
                  <div className="flex justify-end gap-1">
                    <button type="button" onClick={() => openEdit(row)} className="grid h-9 w-9 place-items-center rounded-lg text-text-muted transition-colors hover:bg-surface-elevated hover:text-text-primary" aria-label={`Edit ${row.athlete.first_name} ${row.athlete.last_name}`}>
                      <Pencil aria-hidden="true" size={15} />
                    </button>
                    <button type="button" onClick={() => void toggleMembership(row)} className="grid h-9 w-9 place-items-center rounded-lg text-text-muted transition-colors hover:bg-surface-elevated hover:text-text-primary" aria-label={row.membership.active ? `Archive ${row.athlete.first_name} ${row.athlete.last_name}` : `Reactivate ${row.athlete.first_name} ${row.athlete.last_name}`}>
                      {row.membership.active ? <Archive aria-hidden="true" size={15} /> : <RotateCcw aria-hidden="true" size={15} />}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {editorRow !== undefined && (
        <div className="fixed inset-0 z-50 bg-black/55" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) closeEditor(); }}>
          <section className="absolute inset-x-0 bottom-0 max-h-[92vh] overflow-y-auto rounded-t-2xl border border-border bg-background shadow-2xl sm:inset-y-0 sm:left-auto sm:right-0 sm:max-h-none sm:w-[430px] sm:rounded-none sm:border-y-0 sm:border-r-0" role="dialog" aria-modal="true" aria-labelledby="roster-editor-title">
            <div className="sticky top-0 z-10 flex min-h-16 items-center justify-between border-b border-border bg-background px-5">
              <div>
                <h2 id="roster-editor-title" className="font-extrabold">{editorRow ? "Edit Athlete" : "Add Athlete"}</h2>
                <p className="text-xs text-text-muted">{teamLabel(team)}</p>
              </div>
              <button type="button" onClick={closeEditor} className="grid h-10 w-10 place-items-center rounded-lg text-text-muted hover:bg-surface hover:text-text-primary" aria-label="Close">
                <X aria-hidden="true" size={19} />
              </button>
            </div>

            <form onSubmit={save} className="p-5">
              <fieldset disabled={saving} className="grid gap-4">
                <legend className="mb-3 text-xs font-bold uppercase tracking-[0.08em] text-text-muted">Athlete identity</legend>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="First name" required value={form.first_name} onChange={(value) => setForm((current) => ({ ...current, first_name: value }))} />
                  <Field label="Last name" required value={form.last_name} onChange={(value) => setForm((current) => ({ ...current, last_name: value }))} />
                </div>
                <Field label="Birth year" inputMode="numeric" value={form.birth_year} onChange={(value) => setForm((current) => ({ ...current, birth_year: value }))} />
                <label className="grid gap-1.5 text-xs font-semibold text-text-secondary">
                  Notes
                  <textarea value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} rows={3} className="resize-none rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-text-primary outline-none focus-visible:ring-2 focus-visible:ring-accent" />
                </label>
              </fieldset>

              <fieldset disabled={saving} className="mt-6 grid gap-4 border-t border-border pt-5">
                <legend className="px-0 text-xs font-bold uppercase tracking-[0.08em] text-text-muted">Current team membership</legend>
                <Field label="Jersey number" value={form.jersey_number} onChange={(value) => setForm((current) => ({ ...current, jersey_number: value }))} />
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Primary position" value={form.primary_position} onChange={(value) => setForm((current) => ({ ...current, primary_position: value }))} />
                  <Field label="Secondary position" value={form.secondary_position} onChange={(value) => setForm((current) => ({ ...current, secondary_position: value }))} />
                </div>
              </fieldset>

              {saveError && <div className="mt-5 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2.5 text-sm text-red-200">{saveError}</div>}

              <div className="mt-6 flex justify-end gap-2 border-t border-border pt-5">
                <Button type="button" variant="secondary" onClick={closeEditor} disabled={saving}>Cancel</Button>
                <Button type="submit" disabled={saving}>{saving ? "Saving…" : editorRow ? "Save Changes" : "Add Athlete"}</Button>
              </div>
            </form>
          </section>
        </div>
      )}
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
  required = false,
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  inputMode?: "numeric";
}) {
  return (
    <label className="grid gap-1.5 text-xs font-semibold text-text-secondary">
      {label}{required ? " *" : ""}
      <input
        required={required}
        inputMode={inputMode}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 min-w-0 rounded-lg border border-border bg-surface px-3 text-sm text-text-primary outline-none focus-visible:ring-2 focus-visible:ring-accent"
      />
    </label>
  );
}
