import { ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";

const roster = [
  { number: "12", name: "Emma Johnson", position: "WR / DB" },
  { number: "7", name: "Mia Carter", position: "QB / DB" },
  { number: "3", name: "Ava Smith", position: "C / WR" },
  { number: "18", name: "Zoey Davis", position: "WR" },
  { number: "4", name: "Nora Reed", position: "DB" },
];

const sessions = [
  { drill: "20-Yard Sprint", when: "Yesterday · 5:42 PM", athletes: "9 athletes", status: "Completed" },
  { drill: "Quick Catch", when: "Aug 14 · 6:08 PM", athletes: "10 athletes", status: "Completed" },
  { drill: "5-10-5 Shuttle", when: "Aug 11 · 5:51 PM", athletes: "8 athletes", status: "Completed" },
];

export function HomeScreen({ onNavigate }: { onNavigate: (path: string) => void }) {
  return (
    <section className="mx-auto max-w-[1160px] px-4 pb-7 pt-[18px] md:px-7 md:pt-[22px]">
      <div className="mb-[13px] md:mb-[15px]">
        <h1 className="text-[23px] font-extrabold leading-[1.08] tracking-[-0.035em] md:text-[29px]">Ready for practice.</h1>
        <p className="mt-1 text-[13px] text-text-muted">Start where you left off or choose another drill.</p>
      </div>

      <div className="grid gap-3.5 min-[781px]:grid-cols-[minmax(0,1.62fr)_minmax(290px,0.88fr)]">
        <section className="flex min-h-[272px] flex-col overflow-hidden rounded-[11px] border border-border bg-surface min-[781px]:min-h-[286px]" aria-labelledby="quick-start-title">
          <div className="flex min-h-[46px] items-center justify-between gap-3 border-b border-border px-[15px]">
            <h2 id="quick-start-title" className="text-[13px] font-bold">Quick Start</h2>
            <button type="button" onClick={() => onNavigate("/drills")} className="min-h-10 px-1 text-[11px] font-bold text-text-muted transition-colors hover:text-text-primary">
              Change drill
            </button>
          </div>

          <div className="flex flex-1 flex-col justify-between gap-5 p-[17px] sm:p-5">
            <div>
              <div className="text-[28px] font-extrabold leading-none tracking-[-0.05em] sm:text-[34px] lg:text-[39px]">20-Yard Sprint</div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                <span className="inline-flex min-h-[25px] items-center rounded-full border border-[rgba(124,58,237,0.42)] bg-[rgba(124,58,237,0.14)] px-2.5 text-[10px] font-bold text-[#c4b5fd]">Speed</span>
                <span className="inline-flex min-h-[25px] items-center rounded-full border border-border px-2.5 text-[10px] font-bold text-text-muted">2 attempts</span>
                <span className="inline-flex min-h-[25px] items-center rounded-full border border-border px-2.5 text-[10px] font-bold text-text-muted">10 yd split</span>
              </div>
            </div>

            <div>
              <Button
                type="button"
                size="lg"
                onClick={() => onNavigate("/train")}
                className="min-h-[60px] w-full rounded-[9px] text-base font-extrabold"
              >
                Start Session
              </Button>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <Button type="button" variant="secondary" onClick={() => onNavigate("/train")} className="min-h-10 text-[11px] font-bold">
                  Resume Last Session
                </Button>
                <Button type="button" variant="secondary" onClick={() => onNavigate("/drills")} className="min-h-10 text-[11px] font-bold">
                  Open Drill Library
                </Button>
              </div>
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-[11px] border border-border bg-surface" aria-labelledby="roster-snapshot-title">
          <div className="flex min-h-[46px] items-center justify-between gap-3 border-b border-border px-[15px]">
            <h2 id="roster-snapshot-title" className="text-[13px] font-bold">Roster Snapshot</h2>
            <button type="button" onClick={() => onNavigate("/roster")} className="min-h-10 px-1 text-[11px] font-bold text-text-muted transition-colors hover:text-text-primary">
              View roster
            </button>
          </div>
          <div>
            {roster.map((athlete) => (
              <button
                key={athlete.number}
                type="button"
                onClick={() => onNavigate("/roster")}
                className="grid min-h-[46px] w-full grid-cols-[34px_minmax(0,1fr)_auto] items-center gap-2 border-b border-border px-[13px] text-left last:border-b-0 hover:bg-surface-elevated"
              >
                <span className="text-[11px] font-extrabold tabular-nums text-text-muted">{athlete.number}</span>
                <span className="truncate text-xs font-bold">{athlete.name}</span>
                <span className="text-[10px] font-bold text-text-muted">{athlete.position}</span>
              </button>
            ))}
          </div>
        </section>
      </div>

      <section className="mt-3 overflow-hidden rounded-[11px] border border-border bg-surface md:mt-3.5" aria-labelledby="recent-sessions-title">
        <div className="flex min-h-[46px] items-center justify-between gap-3 border-b border-border px-[15px]">
          <h2 id="recent-sessions-title" className="text-[13px] font-bold">Recent Sessions</h2>
          <button type="button" onClick={() => onNavigate("/data")} className="min-h-10 px-1 text-[11px] font-bold text-text-muted transition-colors hover:text-text-primary">
            View all
          </button>
        </div>
        <div>
          {sessions.map((session) => (
            <button
              key={`${session.drill}-${session.when}`}
              type="button"
              onClick={() => onNavigate("/data")}
              className="grid min-h-12 w-full grid-cols-[minmax(0,1fr)_auto_18px] items-center gap-2.5 border-b border-border px-[15px] text-left last:border-b-0 hover:bg-surface-elevated sm:grid-cols-[minmax(180px,1.4fr)_minmax(100px,.75fr)_minmax(85px,.6fr)_18px] sm:gap-3.5"
            >
              <span className="min-w-0">
                <span className="block truncate text-xs font-bold">{session.drill}</span>
                <span className="block truncate text-[11px] text-text-muted">{session.when}</span>
              </span>
              <span className="hidden text-[11px] text-text-muted sm:block">{session.athletes}</span>
              <span className="text-[11px] text-text-muted">{session.status}</span>
              <ChevronRight aria-hidden={true} size={15} className="text-text-muted" />
            </button>
          ))}
        </div>
      </section>
    </section>
  );
}
