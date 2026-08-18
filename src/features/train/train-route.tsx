import { useEffect, useMemo, useState } from "react";
import { History, UserPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { TrainScreen } from "@/features/train/train-screen";
import { apiRequest, getActiveSession, getRoster, type RosterRow, type SessionDetail, type Team } from "@/lib/api";
import { getSessionResultContext, type SessionResultContext } from "@/lib/history-api";
import { formatResult } from "@/lib/results-api";

async function addAthletesToSession(sessionId: string, athleteIds: string[]): Promise<SessionDetail> {
  return apiRequest<SessionDetail>(`/api/sessions/${encodeURIComponent(sessionId)}/athletes`, {
    method: "POST",
    body: JSON.stringify({ athlete_ids: athleteIds }),
  });
}

export function TrainRoute({
  team,
  onNavigate,
  onSessionStateChange,
}: {
  team: Team | null;
  onNavigate: (path: string) => void;
  onSessionStateChange?: (active: boolean) => void;
}) {
  const [roster, setRoster] = useState<RosterRow[]>([]);
  const [activeSession, setActiveSession] = useState<SessionDetail | null>(null);
  const [resultContext, setResultContext] = useState<SessionResultContext | null>(null);
  const [adding, setAdding] = useState(false);
  const [syncError, setSyncError] = useState("");
  const [trainRevision, setTrainRevision] = useState(0);

  useEffect(() => {
    let cancelled = false;
    if (!team) {
      setRoster([]);
      setActiveSession(null);
      setResultContext(null);
      return;
    }

    const refresh = async () => {
      try {
        const [rows, session] = await Promise.all([getRoster(team.id), getActiveSession(team.id)]);
        if (cancelled) return;
        setRoster(rows);
        setActiveSession(session);
        setSyncError("");
      } catch (error) {
        if (!cancelled) setSyncError(error instanceof Error ? error.message : "Could not check the current roster.");
      }
    };

    void refresh();
    const interval = window.setInterval(() => void refresh(), 5000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [team?.id]);

  useEffect(() => {
    onSessionStateChange?.(Boolean(activeSession));
  }, [activeSession, onSessionStateChange]);

  useEffect(() => {
    let cancelled = false;
    if (!activeSession) {
      setResultContext(null);
      return;
    }
    getSessionResultContext(activeSession.session.id)
      .then((context) => { if (!cancelled) setResultContext(context); })
      .catch(() => { if (!cancelled) setResultContext(null); });
    return () => { cancelled = true; };
  }, [activeSession?.session.id]);

  const missingRosterRows = useMemo(() => {
    if (!activeSession) return [];
    const sessionAthleteIds = new Set(activeSession.athletes.map((athlete) => athlete.athlete_id));
    return roster.filter((row) => !sessionAthleteIds.has(row.athlete.id));
  }, [activeSession, roster]);

  const addMissingAthletes = async () => {
    if (!activeSession || !missingRosterRows.length || adding) return;
    setAdding(true);
    setSyncError("");
    try {
      const refreshed = await addAthletesToSession(
        activeSession.session.id,
        missingRosterRows.map((row) => row.athlete.id),
      );
      setActiveSession(refreshed);
      setTrainRevision((current) => current + 1);
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : "Could not add athletes to this session.");
    } finally {
      setAdding(false);
    }
  };

  const names = missingRosterRows.map((row) => `${row.athlete.first_name} ${row.athlete.last_name}`);
  const notice = names.length === 1
    ? `${names[0]} is on the roster but not in this session yet.`
    : `${names.length} roster athletes are not in this session yet.`;
  const contextRows = activeSession && resultContext
    ? activeSession.athletes.map((athlete) => ({
        athlete,
        context: resultContext.athletes.find((row) => row.athlete_id === athlete.athlete_id) ?? null,
      }))
    : [];
  const hasPriorResults = contextRows.some((row) => (row.context?.result_count ?? 0) > 0);

  return (
    <>
      {activeSession && resultContext?.metric && hasPriorResults && (
        <section className="mx-auto max-w-[1180px] px-3 pt-2 sm:px-4 md:px-6 md:pt-3" aria-label="Prior results for this drill">
          <div className="flex items-center gap-2 overflow-x-auto rounded-lg border border-border bg-surface px-2 py-2">
            <span className="flex shrink-0 items-center gap-1.5 px-1 text-[10px] font-bold uppercase tracking-[0.08em] text-text-muted">
              <History size={14} /> Prior
            </span>
            {contextRows.map(({ athlete, context }) => (
              <div key={athlete.athlete_id} className="flex min-h-9 shrink-0 items-center gap-2 rounded-md border border-border bg-background px-2.5 text-[10px]">
                <strong className="text-text-secondary">{athlete.membership.jersey_number ? `#${athlete.membership.jersey_number} ` : ""}{athlete.athlete.first_name}</strong>
                {(context?.result_count ?? 0) > 0 ? (
                  <>
                    <span className="text-text-muted">PB <b className="text-text-primary">{formatResult(context?.pb ?? null, resultContext.metric)}</b></span>
                    <span className="text-text-muted">Last <b className="text-text-primary">{formatResult(context?.latest ?? null, resultContext.metric)}</b></span>
                  </>
                ) : <span className="text-text-muted">No prior result</span>}
              </div>
            ))}
          </div>
        </section>
      )}

      <TrainScreen key={`${team?.id ?? "no-team"}-${trainRevision}`} team={team} onNavigate={onNavigate} />

      {activeSession && missingRosterRows.length > 0 && (
        <aside className="fixed bottom-[76px] left-3 right-3 z-40 rounded-xl border border-[rgba(124,58,237,0.42)] bg-surface p-3 shadow-2xl md:bottom-5 md:left-auto md:right-5 md:w-[390px]">
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-background text-[#c4b5fd]">
              <UserPlus aria-hidden={true} size={18} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-extrabold">{missingRosterRows.length === 1 ? "New athlete available" : "New athletes available"}</div>
              <p className="mt-0.5 text-xs leading-5 text-text-muted">{notice} Add between attempts to include them in this drill.</p>
              {syncError && <p className="mt-1 text-xs text-danger">{syncError}</p>}
            </div>
          </div>
          <Button type="button" className="mt-3 min-h-11 w-full gap-2 font-extrabold" disabled={adding} onClick={() => void addMissingAthletes()}>
            <UserPlus aria-hidden={true} size={17} />
            {adding ? "Adding…" : `Add ${missingRosterRows.length === 1 ? "to session" : `${missingRosterRows.length} to session`}`}
          </Button>
        </aside>
      )}
    </>
  );
}
