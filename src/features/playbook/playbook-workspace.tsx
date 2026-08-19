import { useEffect, useRef, useState } from "react";
import { BookOpen, Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { setActivePlaybookContext, type PlaybookFormat } from "@/features/playbook/playbook-context";
import { PlaybookScreen } from "@/features/playbook/playbook-screen";
import type { Team } from "@/lib/api";
import { createTeamPlaybook, listTeamPlaybooks, type StoredPlaybook } from "@/lib/playbooks-api";

function selectedPlaybookKey(teamId: string) {
  return `fld-lab:selected-playbook:${teamId}`;
}

function legacyPlayCacheKey(teamId: string) {
  return `fld-lab:playbook:${teamId}`;
}

function scopedPlayCacheKey(teamId: string, playbookId: string) {
  return `fld-lab:playbook:${teamId}:${playbookId}`;
}

function swapBrowserPlayCache(teamId: string, previousPlaybookId: string | null, nextPlaybookId: string) {
  const legacyKey = legacyPlayCacheKey(teamId);
  const legacyValue = window.localStorage.getItem(legacyKey);

  if (previousPlaybookId && legacyValue !== null) {
    window.localStorage.setItem(scopedPlayCacheKey(teamId, previousPlaybookId), legacyValue);
  }

  const nextScopedKey = scopedPlayCacheKey(teamId, nextPlaybookId);
  let nextValue = window.localStorage.getItem(nextScopedKey);

  if (nextValue === null && previousPlaybookId === null && legacyValue !== null) {
    nextValue = legacyValue;
    window.localStorage.setItem(nextScopedKey, legacyValue);
  }

  window.localStorage.setItem(legacyKey, nextValue ?? "[]");
}

function formatLabel(format: PlaybookFormat) {
  return format === "6v6" ? "6v6" : "5v5";
}

export function PlaybookWorkspace({ team }: { team: Team | null }) {
  const [playbooks, setPlaybooks] = useState<StoredPlaybook[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [newFormat, setNewFormat] = useState<PlaybookFormat>("5v5");
  const [newName, setNewName] = useState("5v5 Playbook");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const previousSelectedRef = useRef<string | null>(null);

  useEffect(() => {
    previousSelectedRef.current = null;
    setPlaybooks([]);
    setSelectedId("");
    setLoadError(null);
    setCreateOpen(false);
    setActivePlaybookContext(null);

    if (!team) return;

    let cancelled = false;
    setLoading(true);
    void listTeamPlaybooks(team.id)
      .then((values) => {
        if (cancelled) return;
        setPlaybooks(values);
        const storedId = window.localStorage.getItem(selectedPlaybookKey(team.id));
        const next = values.find((playbook) => playbook.id === storedId) ?? values[0] ?? null;
        if (next) setSelectedId(next.id);
      })
      .catch((error) => {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : "Could not load playbooks.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [team?.id]);

  const selected = playbooks.find((playbook) => playbook.id === selectedId) ?? null;

  if (team && selected) {
    if (previousSelectedRef.current !== selected.id) {
      swapBrowserPlayCache(team.id, previousSelectedRef.current, selected.id);
      previousSelectedRef.current = selected.id;
      window.localStorage.setItem(selectedPlaybookKey(team.id), selected.id);
    }
    setActivePlaybookContext({ id: selected.id, name: selected.name, format: selected.format });
  } else {
    setActivePlaybookContext(null);
  }

  const choosePlaybook = (playbookId: string) => {
    if (!team || playbookId === selectedId) return;
    setSelectedId(playbookId);
  };

  const openCreate = () => {
    setNewFormat("5v5");
    setNewName("5v5 Playbook");
    setCreateError(null);
    setCreateOpen(true);
  };

  const changeNewFormat = (format: PlaybookFormat) => {
    setNewFormat(format);
    if (newName === "5v5 Playbook" || newName === "6v6 Playbook") setNewName(`${format} Playbook`);
  };

  const createPlaybook = async () => {
    if (!team || creating) return;
    const name = newName.trim();
    if (!name) {
      setCreateError("Give the playbook a name.");
      return;
    }
    setCreating(true);
    setCreateError(null);
    try {
      const created = await createTeamPlaybook(team.id, { name, format: newFormat });
      setPlaybooks((current) => [created, ...current]);
      setSelectedId(created.id);
      setCreateOpen(false);
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : "Could not create playbook.");
    } finally {
      setCreating(false);
    }
  };

  if (!team) return <PlaybookScreen team={null} />;

  if (loading) {
    return <section className="p-6 text-sm text-text-muted">Loading playbooks…</section>;
  }

  if (loadError) {
    return (
      <section className="mx-auto max-w-[1220px] p-6">
        <h1 className="text-xl font-extrabold">Playbook</h1>
        <p className="mt-2 text-sm text-danger">{loadError}</p>
        <p className="mt-2 text-xs text-text-muted">Migration 0008 must be applied before multiple playbooks are available.</p>
      </section>
    );
  }

  if (!selected) {
    return (
      <section className="mx-auto flex min-h-[420px] max-w-[760px] flex-col items-center justify-center px-6 text-center">
        <BookOpen size={30} className="text-text-muted" />
        <h1 className="mt-4 text-xl font-extrabold">Create a playbook</h1>
        <p className="mt-2 max-w-md text-sm leading-6 text-text-muted">A team can keep separate 5v5 and 6v6 playbooks. Formation presets and Game Day outputs stay inside the selected playbook.</p>
        <Button className="mt-5" onClick={openCreate}><Plus size={16} />Create playbook</Button>
        {createOpen && (
          <CreatePlaybookDialog
            name={newName}
            format={newFormat}
            creating={creating}
            error={createError}
            onNameChange={setNewName}
            onFormatChange={changeNewFormat}
            onClose={() => setCreateOpen(false)}
            onCreate={() => void createPlaybook()}
          />
        )}
      </section>
    );
  }

  const playbookTeam: Team = {
    ...team,
    season_label: [team.season_label, selected.name, selected.format].filter(Boolean).join(" · "),
  };

  return (
    <>
      <div className="mx-auto max-w-[1220px] px-3 pt-3 sm:px-4 md:px-6 md:pt-4">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface px-3 py-2.5">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="mr-1 text-[9px] font-black uppercase tracking-[0.1em] text-text-muted">Playbook</span>
            {playbooks.map((playbook) => (
              <button
                key={playbook.id}
                type="button"
                onClick={() => choosePlaybook(playbook.id)}
                className={`inline-flex min-h-8 items-center gap-2 rounded-md border px-3 text-[10px] font-extrabold transition-colors ${playbook.id === selected.id ? "border-[rgba(124,58,237,0.55)] bg-[rgba(124,58,237,0.13)] text-text-primary" : "border-border bg-background text-text-muted hover:text-text-primary"}`}
              >
                <span className="max-w-[180px] truncate">{playbook.name}</span>
                <span className={`rounded px-1.5 py-0.5 text-[8px] font-black ${playbook.format === "6v6" ? "bg-[rgba(52,211,153,0.12)] text-[#6ee7b7]" : "bg-[rgba(96,165,250,0.12)] text-[#93c5fd]"}`}>{formatLabel(playbook.format)}</span>
              </button>
            ))}
          </div>
          <button type="button" onClick={openCreate} className="inline-flex min-h-8 items-center gap-1.5 rounded-md border border-border bg-background px-3 text-[10px] font-extrabold text-text-secondary hover:bg-surface-elevated hover:text-text-primary">
            <Plus size={13} />New playbook
          </button>
        </div>
      </div>

      <PlaybookScreen key={`${team.id}-${selected.id}`} team={playbookTeam} />

      {createOpen && (
        <CreatePlaybookDialog
          name={newName}
          format={newFormat}
          creating={creating}
          error={createError}
          onNameChange={setNewName}
          onFormatChange={changeNewFormat}
          onClose={() => setCreateOpen(false)}
          onCreate={() => void createPlaybook()}
        />
      )}
    </>
  );
}

function CreatePlaybookDialog({
  name,
  format,
  creating,
  error,
  onNameChange,
  onFormatChange,
  onClose,
  onCreate,
}: {
  name: string;
  format: PlaybookFormat;
  creating: boolean;
  error: string | null;
  onNameChange: (value: string) => void;
  onFormatChange: (value: PlaybookFormat) => void;
  onClose: () => void;
  onCreate: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[130] flex items-end justify-center bg-black/65 p-3 pb-[calc(12px+env(safe-area-inset-bottom))] sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="Create playbook">
      <button type="button" className="absolute inset-0 cursor-default" aria-label="Close" onClick={creating ? undefined : onClose} />
      <section className="relative z-10 w-full max-w-[430px] rounded-xl border border-border bg-surface p-4 shadow-2xl sm:p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-[9px] font-black uppercase tracking-[0.1em] text-text-muted">New playbook</div>
            <h2 className="mt-1 text-lg font-extrabold">Choose the league format</h2>
          </div>
          <button type="button" onClick={onClose} disabled={creating} className="flex h-9 w-9 items-center justify-center rounded-md border border-border text-text-muted hover:text-text-primary"><X size={16} /></button>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2">
          {(["5v5", "6v6"] as PlaybookFormat[]).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => onFormatChange(option)}
              className={`min-h-16 rounded-lg border p-3 text-left transition-colors ${format === option ? "border-accent bg-[rgba(124,58,237,0.12)]" : "border-border bg-background hover:bg-surface-elevated"}`}
            >
              <span className="block text-sm font-black">{option}</span>
              <span className="mt-1 block text-[9px] leading-4 text-text-muted">{option === "5v5" ? "QB + four eligible roles" : "QB + five eligible roles"}</span>
            </button>
          ))}
        </div>

        <label className="mt-4 grid gap-1 text-[9px] font-bold uppercase tracking-[0.08em] text-text-muted">
          Playbook name
          <input value={name} onChange={(event) => onNameChange(event.target.value.slice(0, 80))} autoFocus className="h-11 rounded-md border border-border bg-background px-3 text-sm font-bold normal-case tracking-normal text-text-primary outline-none focus:border-accent" />
        </label>

        {error && <p className="mt-3 text-xs text-danger">{error}</p>}

        <div className="mt-5 grid grid-cols-2 gap-2">
          <Button type="button" variant="secondary" className="min-h-11" onClick={onClose} disabled={creating}>Cancel</Button>
          <Button type="button" className="min-h-11" onClick={onCreate} disabled={creating}>{creating ? "Creating…" : "Create playbook"}</Button>
        </div>
      </section>
    </div>
  );
}
