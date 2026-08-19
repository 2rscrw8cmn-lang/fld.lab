import { useEffect, useState, type FormEvent } from "react";
import { RefreshCw, ShieldCheck, Trash2, UserPlus, Users, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { Team } from "@/lib/api";
import {
  addTeamCoach,
  listTeamCoaches,
  removeTeamCoach,
  type TeamCoach,
} from "@/lib/team-admin-api";

export function TeamAccessPanel({
  team,
  currentCoachEmail,
  onClose,
}: {
  team: Team;
  currentCoachEmail?: string;
  onClose: () => void;
}) {
  const [coaches, setCoaches] = useState<TeamCoach[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [email, setEmail] = useState("");
  const [adding, setAdding] = useState(false);
  const [removingId, setRemovingId] = useState("");
  const [confirmCoach, setConfirmCoach] = useState<TeamCoach | null>(null);
  const isOwner = team.access_role === "owner";

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      setCoaches(await listTeamCoaches(team.id));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load team access.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // Team identity is the panel boundary.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [team.id]);

  const addCoach = async (event: FormEvent) => {
    event.preventDefault();
    const normalized = email.trim().toLowerCase();
    if (!normalized) return;
    setAdding(true);
    setError("");
    try {
      const added = await addTeamCoach(team.id, normalized);
      setCoaches((current) => {
        const without = current.filter((coach) => coach.id !== added.id);
        return [...without, added].sort((a, b) => (a.role === b.role ? a.email.localeCompare(b.email) : a.role === "owner" ? -1 : 1));
      });
      setEmail("");
    } catch (addError) {
      setError(addError instanceof Error ? addError.message : "Could not add coach access.");
    } finally {
      setAdding(false);
    }
  };

  const confirmRemove = async () => {
    if (!confirmCoach) return;
    setRemovingId(confirmCoach.id);
    setError("");
    try {
      await removeTeamCoach(team.id, confirmCoach.id);
      setCoaches((current) => current.filter((coach) => coach.id !== confirmCoach.id));
      setConfirmCoach(null);
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : "Could not remove coach access.");
    } finally {
      setRemovingId("");
    }
  };

  return (
    <div className="fixed inset-0 z-[80] bg-black/55" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}>
      <section className="absolute inset-x-0 bottom-0 max-h-[92vh] overflow-y-auto rounded-t-2xl border border-border bg-background shadow-2xl sm:inset-y-0 sm:left-auto sm:right-0 sm:max-h-none sm:w-[460px] sm:rounded-none sm:border-y-0 sm:border-r-0" role="dialog" aria-modal="true" aria-labelledby="team-access-title">
        <div className="sticky top-0 z-10 flex min-h-16 items-center justify-between gap-3 border-b border-border bg-background px-5">
          <div className="min-w-0">
            <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-text-muted">Team access</div>
            <h2 id="team-access-title" className="truncate font-extrabold">{team.name}</h2>
          </div>
          <button type="button" onClick={onClose} className="grid h-10 w-10 place-items-center rounded-lg text-text-muted hover:bg-surface hover:text-text-primary" aria-label="Close team access">
            <X size={19} aria-hidden="true" />
          </button>
        </div>

        <div className="p-5">
          <div className="flex items-start gap-3 rounded-xl border border-border bg-surface p-4">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-[rgba(124,58,237,0.36)] bg-[rgba(124,58,237,0.12)] text-[#c4b5fd]">
              <Users size={19} aria-hidden="true" />
            </span>
            <div>
              <div className="text-sm font-extrabold">Coaches with access</div>
              <p className="mt-1 text-xs leading-5 text-text-muted">
                {isOwner
                  ? "Owners can manage this team and its coach access. Coaches can use the roster, Train, and Data but cannot edit team settings or sharing."
                  : "You can use this team, roster, Train, and Data. Only a team owner can change team settings or coach access."}
              </p>
            </div>
          </div>

          {error && (
            <div className="mt-4 flex items-start justify-between gap-3 rounded-lg border border-danger/35 bg-danger/10 p-3 text-xs text-red-100">
              <span>{error}</span>
              <button type="button" onClick={() => setError("")} className="shrink-0 text-red-200" aria-label="Dismiss error"><X size={15} /></button>
            </div>
          )}

          {isOwner && (
            <form onSubmit={addCoach} className="mt-4 rounded-xl border border-border bg-surface p-4">
              <label className="grid gap-1.5 text-xs font-semibold text-text-secondary">
                Add coach by email
                <div className="flex gap-2">
                  <input
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="coach@example.com"
                    className="h-11 min-w-0 flex-1 rounded-lg border border-border bg-background px-3 text-sm text-text-primary outline-none placeholder:text-text-muted focus-visible:ring-2 focus-visible:ring-accent"
                  />
                  <Button type="submit" disabled={adding || !email.trim()} className="h-11 gap-1.5 px-3">
                    <UserPlus size={15} aria-hidden="true" /> {adding ? "Adding…" : "Add"}
                  </Button>
                </div>
              </label>
              <p className="mt-2 text-[10px] leading-4 text-text-muted">The email must already be approved in the fld.LAB Cloudflare Access policy and Worker coach allowlist.</p>
            </form>
          )}

          <section className="mt-4 overflow-hidden rounded-xl border border-border bg-surface">
            {loading ? (
              <div className="space-y-px">
                {[0, 1].map((item) => <div key={item} className="h-[64px] animate-pulse bg-surface-elevated/30" />)}
              </div>
            ) : coaches.length === 0 ? (
              <div className="p-5 text-sm text-text-muted">No active coach access records.</div>
            ) : (
              coaches.map((teamCoach) => {
                const isCurrent = teamCoach.email.toLowerCase() === currentCoachEmail?.toLowerCase();
                const canRemove = isOwner && !isCurrent;
                return (
                  <div key={teamCoach.id} className="flex min-h-[64px] items-center justify-between gap-3 border-b border-border px-4 py-3 last:border-b-0">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-sm font-bold">{teamCoach.email}</span>
                        {isCurrent && <span className="text-[9px] font-bold uppercase tracking-[0.06em] text-text-muted">You</span>}
                      </div>
                      <div className="mt-1 inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.06em] text-[#c4b5fd]">
                        <ShieldCheck size={11} aria-hidden="true" /> {teamCoach.role}
                      </div>
                    </div>
                    {canRemove && (
                      <Button type="button" variant="destructive" size="sm" disabled={removingId === teamCoach.id} onClick={() => setConfirmCoach(teamCoach)} className="gap-1.5">
                        <Trash2 size={14} aria-hidden="true" /> Remove
                      </Button>
                    )}
                  </div>
                );
              })
            )}
          </section>

          {loading && (
            <Button type="button" variant="secondary" size="sm" disabled className="mt-3 gap-1.5"><RefreshCw size={14} className="animate-spin" /> Loading</Button>
          )}
        </div>
      </section>

      {confirmCoach && (
        <div className="fixed inset-0 z-[90] grid place-items-center bg-black/60 p-4" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target && !removingId) setConfirmCoach(null); }}>
          <section role="alertdialog" aria-modal="true" aria-labelledby="remove-coach-title" className="w-full max-w-[420px] rounded-xl border border-border bg-background p-5 shadow-2xl">
            <h3 id="remove-coach-title" className="text-lg font-extrabold">Remove coach access?</h3>
            <p className="mt-2 text-sm leading-6 text-text-muted">{confirmCoach.email} will no longer be able to open {team.name} or its roster, sessions, and results. Existing history is preserved.</p>
            <div className="mt-5 flex justify-end gap-2">
              <Button type="button" variant="secondary" disabled={Boolean(removingId)} onClick={() => setConfirmCoach(null)}>Keep access</Button>
              <Button type="button" variant="destructive" disabled={Boolean(removingId)} onClick={() => void confirmRemove()}>{removingId ? "Removing…" : "Remove access"}</Button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
