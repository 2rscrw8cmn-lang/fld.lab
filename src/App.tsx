import { useCallback, useEffect, useMemo, useState } from "react";

import { getRoute } from "@/app/routes";
import { AppShell } from "@/components/app-shell";
import { RoutePlaceholder } from "@/components/route-placeholder";
import { Button } from "@/components/ui/button";
import { AthleteProfileScreen } from "@/features/athletes/athlete-profile-screen";
import { DataScreen } from "@/features/data/data-screen";
import { DrillLibraryScreen } from "@/features/drills/drill-library-screen";
import { HomeScreen } from "@/features/home/home-screen";
import { RosterScreen } from "@/features/roster/roster-screen";
import { SettingsScreen } from "@/features/settings/settings-screen";
import { FirstTeamSetup } from "@/features/teams/first-team-setup";
import { TrainRoute } from "@/features/train/train-route";
import { TrainStartRoute } from "@/features/train/train-start-route";
import { getActiveSession, listTeams, type Team } from "@/lib/api";

const TEAM_STORAGE_KEY = "fld-lab:last-team-id";

function sortTeams(teams: Team[]) {
  return [...teams].sort((a, b) => a.name.localeCompare(b.name) || (a.season_label ?? "").localeCompare(b.season_label ?? ""));
}

function isTrainPath(path: string) {
  return path === "/train" || path.startsWith("/train/start/");
}

export default function App() {
  const [pathname, setPathname] = useState(() => window.location.pathname);
  const [teams, setTeams] = useState<Team[]>([]);
  const [teamsLoading, setTeamsLoading] = useState(true);
  const [teamId, setTeamId] = useState("");
  const [activeSessionLock, setActiveSessionLock] = useState(false);
  const [pendingNavigationPath, setPendingNavigationPath] = useState<string | null>(null);
  const [checkingNavigation, setCheckingNavigation] = useState(false);

  const completeNavigation = useCallback((path: string) => {
    if (path === pathname) return;
    window.history.pushState({}, "", path);
    setPathname(path);
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [pathname]);

  const reconcileActiveSession = useCallback(async () => {
    if (!activeSessionLock || !teamId) return false;
    try {
      const active = await getActiveSession(teamId);
      const hasActiveSession = Boolean(active);
      setActiveSessionLock(hasActiveSession);
      return hasActiveSession;
    } catch {
      // If the current state cannot be verified, preserve the guard rather than
      // letting a coach accidentally leave an active session.
      return true;
    }
  }, [activeSessionLock, teamId]);

  useEffect(() => {
    const handlePopState = () => {
      const nextPath = window.location.pathname;
      if (isTrainPath(pathname) && !isTrainPath(nextPath) && activeSessionLock) {
        window.history.pushState({}, "", pathname);
        setCheckingNavigation(true);
        void reconcileActiveSession().then((hasActiveSession) => {
          setCheckingNavigation(false);
          if (hasActiveSession) setPendingNavigationPath(nextPath);
          else completeNavigation(nextPath);
        });
        return;
      }
      setPathname(nextPath);
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [activeSessionLock, completeNavigation, pathname, reconcileActiveSession]);

  useEffect(() => {
    let cancelled = false;

    const loadTeams = async () => {
      setTeamsLoading(true);
      try {
        const activeTeams = await listTeams();
        if (cancelled) return;
        setTeams(activeTeams);

        const storedTeamId = window.localStorage.getItem(TEAM_STORAGE_KEY);
        const nextTeamId = activeTeams.some((team) => team.id === storedTeamId)
          ? storedTeamId!
          : activeTeams[0]?.id ?? "";
        setTeamId(nextTeamId);
        if (nextTeamId) window.localStorage.setItem(TEAM_STORAGE_KEY, nextTeamId);
      } catch {
        if (!cancelled) {
          setTeams([]);
          setTeamId("");
        }
      } finally {
        if (!cancelled) setTeamsLoading(false);
      }
    };

    void loadTeams();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!teamId) {
      setActiveSessionLock(false);
      return;
    }

    // Train reports its current session state directly so the lock updates as sessions start/end.
    if (pathname === "/train") return;

    getActiveSession(teamId)
      .then((active) => { if (!cancelled) setActiveSessionLock(Boolean(active)); })
      .catch(() => { if (!cancelled) setActiveSessionLock(false); });

    return () => { cancelled = true; };
  }, [pathname, teamId]);

  useEffect(() => {
    if (!activeSessionLock) setPendingNavigationPath(null);
  }, [activeSessionLock]);

  const navigate = (path: string) => {
    if (path === pathname || checkingNavigation) return;
    if (isTrainPath(pathname) && !isTrainPath(path) && activeSessionLock) {
      setCheckingNavigation(true);
      void reconcileActiveSession().then((hasActiveSession) => {
        setCheckingNavigation(false);
        if (hasActiveSession) setPendingNavigationPath(path);
        else completeNavigation(path);
      });
      return;
    }
    completeNavigation(path);
  };

  const selectTeam = (nextTeamId: string) => {
    if (activeSessionLock) return;
    setTeamId(nextTeamId);
    if (nextTeamId) window.localStorage.setItem(TEAM_STORAGE_KEY, nextTeamId);
  };

  const handleTeamCreated = (team: Team) => {
    setTeams((current) => sortTeams([...current.filter((candidate) => candidate.id !== team.id), team]));
    setTeamId(team.id);
    window.localStorage.setItem(TEAM_STORAGE_KEY, team.id);
  };

  const handleManagedTeamCreated = (team: Team) => {
    if (!team.active) return;
    setTeams((current) => sortTeams([...current.filter((candidate) => candidate.id !== team.id), team]));
  };

  const handleTeamUpdated = (team: Team) => {
    const nextTeams = team.active
      ? sortTeams([...teams.filter((candidate) => candidate.id !== team.id), team])
      : teams.filter((candidate) => candidate.id !== team.id);
    setTeams(nextTeams);

    if (!team.active && team.id === teamId) {
      const nextTeamId = nextTeams[0]?.id ?? "";
      setTeamId(nextTeamId);
      if (nextTeamId) window.localStorage.setItem(TEAM_STORAGE_KEY, nextTeamId);
      else window.localStorage.removeItem(TEAM_STORAGE_KEY);
    }
  };

  const confirmLeaveSession = () => {
    const path = pendingNavigationPath;
    setPendingNavigationPath(null);
    if (path) completeNavigation(path);
  };

  const athleteMatch = pathname.match(/^\/athletes\/([^/]+)$/);
  const athleteId = athleteMatch ? decodeURIComponent(athleteMatch[1]) : null;
  const trainStartMatch = pathname.match(/^\/train\/start\/([^/]+)$/);
  const trainStartDrillId = trainStartMatch ? decodeURIComponent(trainStartMatch[1]) : null;
  const route = getRoute(trainStartDrillId ? "/train" : pathname);
  const activePath = athleteId ? "/roster" : trainStartDrillId ? "/train" : route.path;
  const activeTeam = useMemo(() => teams.find((team) => team.id === teamId) ?? null, [teamId, teams]);

  let screen = <RoutePlaceholder route={route} />;
  if (athleteId) {
    screen = <AthleteProfileScreen team={activeTeam} athleteId={athleteId} onNavigate={navigate} />;
  } else if (trainStartDrillId) {
    screen = <TrainStartRoute team={activeTeam} drillId={trainStartDrillId} onNavigate={navigate} />;
  } else if (activePath === "/") {
    screen = <HomeScreen onNavigate={navigate} team={activeTeam} />;
  } else if (activePath === "/roster") {
    screen = teamsLoading
      ? <RosterScreen team={null} onNavigate={navigate} />
      : activeTeam
        ? <RosterScreen team={activeTeam} onNavigate={navigate} />
        : <FirstTeamSetup onCreated={handleTeamCreated} />;
  } else if (activePath === "/train") {
    screen = <TrainRoute team={activeTeam} onNavigate={navigate} onSessionStateChange={setActiveSessionLock} />;
  } else if (activePath === "/data") {
    screen = <DataScreen team={activeTeam} />;
  } else if (activePath === "/drills") {
    screen = <DrillLibraryScreen />;
  } else if (activePath === "/settings") {
    screen = (
      <SettingsScreen
        currentTeamId={teamId}
        teamSwitchDisabled={activeSessionLock}
        onSelectTeam={selectTeam}
        onTeamCreated={handleManagedTeamCreated}
        onTeamUpdated={handleTeamUpdated}
      />
    );
  }

  return (
    <>
      <AppShell
        pathname={activePath}
        teams={teams}
        teamId={teamId}
        teamsLoading={teamsLoading}
        teamSwitchDisabled={activeSessionLock || Boolean(trainStartDrillId)}
        onTeamChange={selectTeam}
        onNavigate={navigate}
      >
        {screen}
      </AppShell>

      {pendingNavigationPath && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/55 p-3 pb-[calc(12px+env(safe-area-inset-bottom))] sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="leave-session-title">
          <button type="button" className="absolute inset-0 cursor-default" aria-label="Stay in session" onClick={() => setPendingNavigationPath(null)} />
          <section className="relative z-10 w-full max-w-[440px] rounded-xl border border-border bg-surface p-4 shadow-2xl sm:p-5">
            <h2 id="leave-session-title" className="text-base font-extrabold">Leave active session?</h2>
            <p className="mt-2 text-sm leading-5 text-text-muted">
              The session will stay active and can be resumed when you return. Any unsaved capture should be saved before leaving.
            </p>
            <div className="mt-5 grid grid-cols-2 gap-2">
              <Button type="button" variant="secondary" className="min-h-11" onClick={() => setPendingNavigationPath(null)}>Stay</Button>
              <Button type="button" className="min-h-11" onClick={confirmLeaveSession}>Leave session</Button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
