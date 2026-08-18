import { useEffect, useMemo, useState } from "react";
import { UserPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { TrainScreen } from "@/features/train/train-screen";
import { getActiveSession, getRoster, type RosterRow, type SessionDetail, type Team } from "@/lib/api";

async function addAthletesToSession(sessionId: string, athleteIds: string[]): Promise<SessionDetail> {
  const response = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/athletes`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ athlete_ids: athleteIds }),
  });

  if (!response.ok) {
    let message = "Could not add athletes to the session.";
    try {
      const body = await response.json() as { error?: { message?: string } };
      message = body.error?.message ?? message;
    } catch {
      // Keep the generic message when the API did not return JSON.
    }
    throw new Error(message);
  }

  return response.json() as Promise<SessionDetail>;
}

export function TrainRoute({ team, onNavigate }: { team: Team | null; onNavigate: (path: string) => void }) {
  const [roster, setRoster] = useState<RosterRow[]>([]);
  const [activeSession, setActiveSession] = useState<SessionDetail | null>(null);
  const [adding, setAdding] = useState(false);
  const [syncError, setSyncError] = useState("");
  const [trainRevision, setTrainRevision] = useState(0);

  useEffect(() => {
    let cancelled = false;
    if (!team) {
      setRoster([]);
      setActiveSession(null);
      return;
    }

    Promise.all([getRoster(team.id), getActiveSession(team.id)])
      .then(([rows, session]) => {
        if (cancelled) return;
        setRoster(rows);
        setActiveSession(session);
        setSyncError("");
      })
      .catch((error) => {
        if (!cancelled) setSyncError(error instanceof Error ? error.message : "Could not check the current roster.");
      });

    return () => { cancelled = true; };
  }, [team?.id]);

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
      // Remount Train so its local queue is rebuilt from the refreshed session snapshot.
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

  return (
    <>
      <TrainScreen key={`${team?.id ?? "no-team"}-${trainRevision}`} team={team} onNavigate={onNavigate} />

      {activeSession && missingRosterRows.length > 0 && (
        <aside className="fixed bottom-[76px] left-3 right-3 z-40 rounded-xl border border-[rgba(124,58,237,0.42)] bg-surface p-3 shadow-2xl md:bottom-5 md:left-auto md:right-5 md:w-[390px]">
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-background text-[#c4b5fd]">
              <UserPlus aria-hidden={true} size={18} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-extrabold">{missingRosterRows.length === 1 ? "New athlete available" : "New athletes available"}</div>
              <p className="mt-0.5 text-xs leading-5 text-text-muted">{notice} Add between attempts to include {missingRosterRows.length === 1 ? "them" : "them"} in this drill.</p>
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
