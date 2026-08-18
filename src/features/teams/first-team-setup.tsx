import { useState, type FormEvent } from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { createTeam, type Team } from "@/lib/api";

export function FirstTeamSetup({ onCreated }: { onCreated: (team: Team) => void }) {
  const [name, setName] = useState("");
  const [ageGroup, setAgeGroup] = useState("");
  const [seasonLabel, setSeasonLabel] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Team name is required.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const team = await createTeam({
        name: trimmedName,
        age_group: ageGroup.trim() || null,
        season_label: seasonLabel.trim() || null,
      });
      onCreated(team);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create the team. Try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="mx-auto max-w-[1160px] px-4 pb-8 pt-[18px] md:px-7 md:pt-[22px]">
      <div>
        <h1 className="text-[23px] font-extrabold leading-[1.08] tracking-[-0.035em] md:text-[29px]">Roster</h1>
        <p className="mt-1 text-[13px] text-text-muted">No team selected</p>
      </div>

      <div className="mt-5 max-w-[520px] rounded-[11px] border border-border bg-surface p-5 sm:p-6">
        <h2 className="text-sm font-bold">Create your first team</h2>
        <p className="mt-1 text-sm leading-6 text-text-muted">Set up the team once, then you can start adding athletes to its roster.</p>

        <form onSubmit={submit} className="mt-5 grid gap-4">
          <label className="grid gap-1.5 text-xs font-semibold text-text-secondary">
            Team name
            <input
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="U10 Purple"
              className="h-11 rounded-lg border border-border bg-background px-3 text-sm text-text-primary outline-none placeholder:text-text-muted focus-visible:ring-2 focus-visible:ring-accent"
            />
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-1.5 text-xs font-semibold text-text-secondary">
              Age group
              <input
                value={ageGroup}
                onChange={(event) => setAgeGroup(event.target.value)}
                placeholder="U10"
                className="h-11 rounded-lg border border-border bg-background px-3 text-sm text-text-primary outline-none placeholder:text-text-muted focus-visible:ring-2 focus-visible:ring-accent"
              />
            </label>

            <label className="grid gap-1.5 text-xs font-semibold text-text-secondary">
              Season
              <input
                value={seasonLabel}
                onChange={(event) => setSeasonLabel(event.target.value)}
                placeholder="Fall 2026"
                className="h-11 rounded-lg border border-border bg-background px-3 text-sm text-text-primary outline-none placeholder:text-text-muted focus-visible:ring-2 focus-visible:ring-accent"
              />
            </label>
          </div>

          {error && (
            <div className="rounded-lg border border-red-400/25 bg-red-500/10 px-3 py-2.5 text-sm text-red-200" role="alert">
              {error}
            </div>
          )}

          <Button type="submit" disabled={saving} className="mt-1 min-h-11 gap-2 self-start px-5">
            <Plus aria-hidden="true" size={17} />
            {saving ? "Creating…" : "Create Team"}
          </Button>
        </form>
      </div>
    </section>
  );
}
