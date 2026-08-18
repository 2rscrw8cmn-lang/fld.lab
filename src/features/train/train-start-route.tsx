import { useEffect, useState } from "react";
import { AlertTriangle, LoaderCircle, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ApiError, createTrainingSession, type Team } from "@/lib/api";

export function TrainStartRoute({
  team,
  drillId,
  onNavigate,
}: {
  team: Team | null;
  drillId: string;
  onNavigate: (path: string) => void;
}) {
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    if (!team || !drillId) return;

    setError("");
    createTrainingSession(team.id, drillId)
      .then(() => {
        if (!cancelled) onNavigate("/train");
      })
      .catch((startError) => {
        if (cancelled) return;
        if (startError instanceof ApiError && startError.status === 409) {
          onNavigate("/train");
          return;
        }
        setError(startError instanceof Error ? startError.message : "Could not start this drill.");
      });

    return () => { cancelled = true; };
    // A deliberate retry is represented by `attempt`; navigation identity is team + drill.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt, drillId, team?.id]);

  if (!team) {
    return (
      <section className="mx-auto max-w-[720px] px-4 py-8 md:px-7">
        <div className="rounded-xl border border-border bg-surface p-6">
          <h1 className="text-lg font-extrabold">No team selected</h1>
          <p className="mt-1 text-sm text-text-muted">Select a team before starting a drill.</p>
          <Button className="mt-4" onClick={() => onNavigate("/")}>Back to Home</Button>
        </div>
      </section>
    );
  }

  return (
    <section className="mx-auto flex min-h-[60vh] max-w-[720px] items-center px-4 py-8 md:px-7">
      <div className="w-full rounded-xl border border-border bg-surface p-6 text-center sm:p-8">
        {error ? (
          <>
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-danger/35 bg-danger/10 text-danger">
              <AlertTriangle size={21} aria-hidden="true" />
            </span>
            <h1 className="mt-4 text-xl font-extrabold">Couldn’t start this drill</h1>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-text-muted">{error}</p>
            <div className="mt-5 grid gap-2 sm:grid-cols-2">
              <Button variant="warning" className="min-h-11 gap-2" onClick={() => setAttempt((value) => value + 1)}>
                <RotateCcw size={16} aria-hidden="true" /> Retry
              </Button>
              <Button variant="secondary" className="min-h-11" onClick={() => onNavigate("/")}>Back to Home</Button>
            </div>
          </>
        ) : (
          <>
            <LoaderCircle className="mx-auto animate-spin text-[#c4b5fd]" size={30} aria-hidden="true" />
            <h1 className="mt-4 text-xl font-extrabold">Starting session…</h1>
            <p className="mt-1 text-sm text-text-muted">Loading the current roster and drill definition.</p>
          </>
        )}
      </div>
    </section>
  );
}
