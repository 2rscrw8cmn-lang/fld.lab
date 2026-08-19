import { useEffect, useState, type FormEvent } from "react";
import {
  Archive,
  Check,
  LogOut,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  UserRound,
  Users,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { TeamAccessPanel } from "@/features/settings/team-access-panel";
import { createTeam, getCurrentCoach, type CurrentCoach, type Team } from "@/lib/api";
import { listAllTeams, patchTeam } from "@/lib/team-admin-api";

type SettingsScreenProps = {
  currentTeamId: string;
  teamSwitchDisabled: boolean;
  onSelectTeam: (teamId: string) => void;
  onTeamCreated: (team: Team) => void;
  onTeamUpdated: (team: Team) => void;
};

type TeamForm = {
  name: string;
  age_group: string;
  season_label: string;
};

const EMPTY_FORM: TeamForm = { name: "", age_group: "", season_label: "" };

function formFromTeam(team: Team): TeamForm {
  return {
    name: team.name,
    age_group: team.age_group ?? "",
    season_label: team.season_label ?? "",
  };
}

function teamSubtitle(team: Team) {
  return [team.age_group, team.season_label].filter(Boolean).join(" · ") || "No age group or season set";
}

export function SettingsScreen({
  currentTeamId,
  teamSwitchDisabled,
  onSelectTeam,
  onTeamCreated,
  onTeamUpdated,
}: SettingsScreenProps) {
  const [coach, setCoach] = useState<CurrentCoach | null>(null);
  const [coachLoading, setCoachLoading] = useState(true);
  const [coachError, setCoachError] = useState("");
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [editor, setEditor] = useState<Team | null | undefined>(undefined);
  const [accessTeam, setAccessTeam] = useState<Team | null>(null);
  const [form, setForm] = useState<TeamForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [updatingId, setUpdatingId] = useState("");

  const loadCoach = async () => {
    setCoachLoading(true);
    setCoachError("");
    try {
      setCoach(await getCurrentCoach());
    } catch (error) {
      setCoach(null);
      setCoachError(error instanceof Error ? error.message : "Could not verify the signed-in coach.");
    } finally {
      setCoachLoading(false);
    }
  };

  const load = async () => {
    setLoading(true);
    setLoadError("");
    try {
      setTeams(await listAllTeams());
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Could not load teams.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadCoach();
    void load();
  }, []);

  const openCreate = () => {
    setEditor(null);
    setForm(EMPTY_FORM);
    setSaveError("");
  };

  const openEdit = (team: Team) => {
    if (team.access_role !== "owner") return;
    setEditor(team);
    setForm(formFromTeam(team));
    setSaveError("");
  };

  const closeEditor = () => {
    if (saving) return;
    setEditor(undefined);
    setSaveError("");
  };

  const saveTeam = async (event: FormEvent) => {
    event.preventDefault();
    const name = form.name.trim();
    if (!name) {
      setSaveError("Team name is required.");
      return;
    }

    setSaving(true);
    setSaveError("");
    try {
      const input = {
        name,
        age_group: form.age_group.trim() || null,
        season_label: form.season_label.trim() || null,
      };
      const saved = editor
        ? await patchTeam(editor.id, input)
        : await createTeam(input);

      setTeams((current) => {
        const without = current.filter((team) => team.id !== saved.id);
        return [...without, saved].sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name));
      });
      if (editor) onTeamUpdated(saved);
      else onTeamCreated(saved);
      setEditor(undefined);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Could not save this team.");
    } finally {
      setSaving(false);
    }
  };

  const setTeamActive = async (team: Team, active: boolean) => {
    if (team.access_role !== "owner") return;
    if (!active && team.id === currentTeamId && teamSwitchDisabled) return;

    setUpdatingId(team.id);
    setLoadError("");
    try {
      const saved = await patchTeam(team.id, { active });
      setTeams((current) => current.map((candidate) => candidate.id === saved.id ? saved : candidate)
        .sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name)));
      onTeamUpdated(saved);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Could not update this team.");
    } finally {
      setUpdatingId("");
    }
  };

  return (
    <section className="mx-auto max-w-[1120px] px-4 pb-10 pt-[18px] md:px-7 md:pt-[22px]">
      <header>
        <h1 className="text-[23px] font-extrabold leading-[1.08] tracking-[-0.035em] md:text-[29px]">Settings</h1>
        <p className="mt-1 text-[13px] text-text-muted">Coach identity, teams, and application management.</p>
      </header>

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.45fr)]">
        <section className="overflow-hidden rounded-xl border border-border bg-surface">
          <div className="border-b border-border px-4 py-3">
            <div className="text-sm font-extrabold">Coach profile</div>
            <div className="mt-0.5 text-[11px] text-text-muted">Signed-in identity for fld.LAB</div>
          </div>
          <div className="p-4">
            <div className="flex items-start gap-3">
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl border border-[rgba(124,58,237,0.36)] bg-[rgba(124,58,237,0.12)] text-[#c4b5fd]">
                <UserRound size={22} aria-hidden="true" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-extrabold">Coach</div>
                {coachLoading ? (
                  <div className="mt-2 h-6 w-40 animate-pulse rounded bg-surface-elevated" />
                ) : coach ? (
                  <>
                    <div className="mt-0.5 truncate text-sm text-text-secondary">{coach.email}</div>
                    <div className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-success/30 bg-success/10 px-2 py-1 text-[10px] font-bold text-success">
                      <ShieldCheck size={12} aria-hidden="true" />
                      {coach.provider === "cloudflare-access" ? "Cloudflare Access verified" : "Local development"}
                    </div>
                  </>
                ) : (
                  <div className="mt-1 text-xs text-amber-200">Coach identity unavailable</div>
                )}
              </div>
            </div>

            {coachError ? (
              <div className="mt-4 rounded-lg border border-amber-400/25 bg-amber-400/10 p-3 text-xs text-amber-100">
                <p>{coachError}</p>
                <Button type="button" variant="warning" size="sm" onClick={() => void loadCoach()} className="mt-3 gap-1.5">
                  <RefreshCw size={14} aria-hidden="true" /> Retry identity check
                </Button>
              </div>
            ) : (
              <p className="mt-4 text-xs leading-5 text-text-muted">
                {coach?.provider === "development"
                  ? "Local development uses a fictional coach identity. Production must use the configured Cloudflare Access account."
                  : "Cloudflare verifies this identity. Team access below determines which rosters, sessions, and results this account can use."}
              </p>
            )}

            {coach?.provider === "cloudflare-access" && (
              <Button
                type="button"
                variant="secondary"
                className="mt-4 w-full gap-2"
                onClick={() => window.location.assign("/cdn-cgi/access/logout")}
              >
                <LogOut size={15} aria-hidden="true" /> Sign out
              </Button>
            )}
          </div>
        </section>

        <section className="overflow-hidden rounded-xl border border-border bg-surface">
          <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
            <div>
              <div className="text-sm font-extrabold">Teams</div>
              <div className="mt-0.5 text-[11px] text-text-muted">Only teams shared with this coach appear here.</div>
            </div>
            <Button type="button" size="sm" onClick={openCreate} className="gap-1.5">
              <Plus size={15} aria-hidden="true" /> New team
            </Button>
          </div>

          {loadError && (
            <div className="flex items-center justify-between gap-3 border-b border-amber-400/25 bg-amber-400/10 px-4 py-3 text-xs text-amber-100">
              <span>{loadError}</span>
              <Button type="button" variant="warning" size="sm" onClick={() => void load()} className="gap-1.5">
                <RefreshCw size={14} aria-hidden="true" /> Retry
              </Button>
            </div>
          )}

          {teamSwitchDisabled && (
            <div className="border-b border-border bg-[rgba(124,58,237,0.08)] px-4 py-2.5 text-[11px] text-[#c4b5fd]">
              Finish or quit the active training session before switching teams or archiving the current team.
            </div>
          )}

          {loading ? (
            <div className="divide-y divide-border">
              {[0, 1, 2].map((item) => <div key={item} className="h-[70px] animate-pulse bg-surface-elevated/25" />)}
            </div>
          ) : teams.length === 0 ? (
            <div className="p-6 text-center">
              <p className="text-sm font-bold">No teams yet.</p>
              <p className="mt-1 text-xs text-text-muted">Create a team and you will become its owner.</p>
              <Button type="button" onClick={openCreate} className="mt-4 gap-2"><Plus size={15} />Create team</Button>
            </div>
          ) : (
            <div>
              {teams.map((team) => {
                const current = team.id === currentTeamId;
                const busy = updatingId === team.id;
                const isOwner = team.access_role === "owner";
                return (
                  <div key={team.id} className={`flex flex-col gap-3 border-b border-border px-4 py-3 last:border-b-0 sm:flex-row sm:items-center sm:justify-between ${team.active ? "" : "opacity-60"}`}>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-sm font-extrabold">{team.name}</span>
                        {current && team.active && (
                          <span className="inline-flex items-center gap-1 rounded-full border border-[rgba(124,58,237,0.4)] bg-[rgba(124,58,237,0.14)] px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.06em] text-[#c4b5fd]">
                            <Check size={10} /> Current
                          </span>
                        )}
                        <span className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.06em] text-text-muted">
                          <ShieldCheck size={10} /> {isOwner ? "Owner" : "Coach"}
                        </span>
                        {!team.active && <span className="rounded-full border border-border px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.06em] text-text-muted">Archived</span>}
                      </div>
                      <div className="mt-1 text-[11px] text-text-muted">{teamSubtitle(team)}</div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {team.active && !current && (
                        <Button type="button" size="sm" onClick={() => onSelectTeam(team.id)} disabled={teamSwitchDisabled || busy}>Use team</Button>
                      )}
                      <Button type="button" variant="secondary" size="sm" onClick={() => setAccessTeam(team)} disabled={busy} className="gap-1.5">
                        <Users size={14} aria-hidden="true" /> Access
                      </Button>
                      {isOwner && (
                        <Button type="button" variant="secondary" size="sm" onClick={() => openEdit(team)} disabled={busy} className="gap-1.5">
                          <Pencil size={14} aria-hidden="true" /> Edit
                        </Button>
                      )}
                      {isOwner && (team.active ? (
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          onClick={() => void setTeamActive(team, false)}
                          disabled={busy || (current && teamSwitchDisabled)}
                          className="gap-1.5"
                        >
                          <Archive size={14} aria-hidden="true" /> Archive
                        </Button>
                      ) : (
                        <Button type="button" variant="success" size="sm" onClick={() => void setTeamActive(team, true)} disabled={busy} className="gap-1.5">
                          <RotateCcw size={14} aria-hidden="true" /> Reactivate
                        </Button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {editor !== undefined && (
        <div className="fixed inset-0 z-[70] bg-black/55" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) closeEditor(); }}>
          <section className="absolute inset-x-0 bottom-0 max-h-[92vh] overflow-y-auto rounded-t-2xl border border-border bg-background shadow-2xl sm:inset-y-0 sm:left-auto sm:right-0 sm:max-h-none sm:w-[430px] sm:rounded-none sm:border-y-0 sm:border-r-0" role="dialog" aria-modal="true" aria-labelledby="team-editor-title">
            <div className="sticky top-0 z-10 flex min-h-16 items-center justify-between border-b border-border bg-background px-5">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-text-muted">Team management</div>
                <h2 id="team-editor-title" className="font-extrabold">{editor ? "Edit team" : "Create team"}</h2>
              </div>
              <button type="button" onClick={closeEditor} className="grid h-10 w-10 place-items-center rounded-lg text-text-muted hover:bg-surface hover:text-text-primary" aria-label="Close">
                <X size={19} aria-hidden="true" />
              </button>
            </div>

            <form onSubmit={saveTeam} className="grid gap-4 p-5">
              <Field label="Team name" value={form.name} required autoFocus onChange={(value) => setForm((current) => ({ ...current, name: value }))} />
              <div className="grid grid-cols-2 gap-3">
                <Field label="Age group" value={form.age_group} placeholder="U10" onChange={(value) => setForm((current) => ({ ...current, age_group: value }))} />
                <Field label="Season" value={form.season_label} placeholder="Fall 2026" onChange={(value) => setForm((current) => ({ ...current, season_label: value }))} />
              </div>

              {saveError && <div className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2.5 text-sm text-red-200">{saveError}</div>}

              <div className="mt-2 flex justify-end gap-2 border-t border-border pt-5">
                <Button type="button" variant="secondary" onClick={closeEditor} disabled={saving}>Cancel</Button>
                <Button type="submit" disabled={saving}>{saving ? "Saving…" : editor ? "Save changes" : "Create team"}</Button>
              </div>
            </form>
          </section>
        </div>
      )}

      {accessTeam && (
        <TeamAccessPanel team={accessTeam} currentCoachEmail={coach?.email} onClose={() => setAccessTeam(null)} />
      )}
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  required = false,
  autoFocus = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  autoFocus?: boolean;
}) {
  return (
    <label className="grid gap-1.5 text-xs font-semibold text-text-secondary">
      {label}{required ? " *" : ""}
      <input
        autoFocus={autoFocus}
        required={required}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 min-w-0 rounded-lg border border-border bg-surface px-3 text-sm text-text-primary outline-none placeholder:text-text-muted focus-visible:ring-2 focus-visible:ring-accent"
      />
    </label>
  );
}
