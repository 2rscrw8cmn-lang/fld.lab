import type { ResultMetric } from "@/lib/results-api";

export type SessionSummary = {
  id: string;
  team_id: string;
  drill_id: string;
  drill_version_id: string;
  drill_name: string;
  drill_category: string;
  started_at: string;
  completed_at: string | null;
  status: "active" | "completed" | "abandoned";
  athlete_count: number;
  completed_count: number;
  skipped_count: number;
  attempt_count: number;
};

export type TeamTrendPoint = {
  session_id: string;
  started_at: string;
  completed_at: string | null;
  status: "active" | "completed" | "abandoned";
  average: number;
  athlete_count: number;
};

export type TeamDrillTrend = {
  drill: { id: string; name: string; category: string };
  metric: ResultMetric | null;
  points: TeamTrendPoint[];
};

export type SessionResultContext = {
  session_id: string;
  metric: ResultMetric | null;
  athletes: Array<{
    athlete_id: string;
    pb: number | null;
    latest: number | null;
    previous: number | null;
    result_count: number;
  }>;
};

async function read<T>(url: string): Promise<T> {
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) {
    let message = "Could not load history.";
    try {
      const body = await response.json() as { error?: { message?: string } };
      message = body.error?.message ?? message;
    } catch {
      // Keep generic message for non-JSON failures.
    }
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}

export async function listTeamSessions(teamId: string, limit = 12): Promise<SessionSummary[]> {
  const data = await read<{ sessions: SessionSummary[] }>(
    `/api/teams/${encodeURIComponent(teamId)}/sessions?limit=${encodeURIComponent(String(limit))}`,
  );
  return data.sessions;
}

export async function getTeamDrillTrend(teamId: string, drillId: string): Promise<TeamDrillTrend> {
  return read<TeamDrillTrend>(
    `/api/teams/${encodeURIComponent(teamId)}/drills/${encodeURIComponent(drillId)}/trend`,
  );
}

export async function getSessionResultContext(sessionId: string): Promise<SessionResultContext> {
  return read<SessionResultContext>(`/api/sessions/${encodeURIComponent(sessionId)}/result-context`);
}
