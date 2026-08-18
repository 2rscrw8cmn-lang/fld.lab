import { useEffect, useMemo, useState } from "react";

import { getRoute } from "@/app/routes";
import { AppShell } from "@/components/app-shell";
import { RoutePlaceholder } from "@/components/route-placeholder";
import { AthleteProfileScreen } from "@/features/athletes/athlete-profile-screen";
import { DataScreen } from "@/features/data/data-screen";
import { DrillLibraryScreen } from "@/features/drills/drill-library-screen";
import { HomeScreen } from "@/features/home/home-screen";
import { RosterScreen } from "@/features/roster/roster-screen";
import { SettingsScreen } from "@/features/settings/settings-screen";
import { FirstTeamSetup } from "@/features/teams/first-team-setup";
import { TrainRoute } from "@/features/train/train-route";
import { getActiveSession, listTeams, type Team } from "@/lib/api";

const TEAM_STORAGE_KEY = "fld-lab:last-team-id";

function sortTeams(teams: Team[]) {
  return [...teams].sort((a, b) => a.name.localeCompare(b.name) || (a.season_label ?? "").localeCompare(b.season_label ?? ""));
}

export default function App() {
  const [pathname, setPathname] = useState(() => window.location.pathname);
  const [teams, setTeams] = useState<Team[]>([]);
  const [teamsLoading, setTeamsLoading] = useState(true);
  const [teamId, setTeamId] = useState("");
  const [activeSessionLock, setActiveSessionLock] = useState(false);

  useEffect(() => {
    const handlePopState = () => setPathname(window.location.pathname);
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

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

    if (pathname === "/train") setActiveSessionLock(true);
    getActiveSession(teamId)
      .then((active) => { if (!cancelled && pathname !== "/train") setActiveSessionLock(Boolean(active)); })
      .catch(() => { if (!cancelled && pathname !== "/train") setActiveSessionLock(false); });

    return () => { cancelled = true; };
  }, [pathname, teamId]);

  const navigate = (path: string) => {
    if (path === pathname) return;
    window.history.pushState({}, "", path);
    setPathname(path);
    window.scrollTo({ top: 0, behavior: "auto" });
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

  const athleteMatch = pathname.match(/^\/athletes\/([^/]+)$/);
  const athleteId = athleteMatch ? decodeURIComponent(athleteMatch[1]) : null;
  const route = getRoute(pathname);
  const activePath = athleteId ? "/roster" : route.path;
  const activeTeam = useMemo(() => teams.find((team) => team.id === teamId) ?? null, [teamId, teams]);

  let screen = <RoutePlaceholder route={route} />;
  if (athleteId) {
    screen = <AthleteProfileScreen team={activeTeam} athleteId={athleteId} onNavigate={navigate} />;
  } else if (activePath === "/") {
    screen = <HomeScreen onNavigate={navigate} team={activeTeam} />;
  } else if (activePath === "/roster") {
    screen = teamsLoading
      ? <RosterScreen team={null} onNavigate={navigate} />
      : activeTeam
        ? <RosterScreen team={activeTeam} onNavigate={navigate} />
        : <FirstTeamSetup onCreated={handleTeamCreated} />;
  } else if (activePath === "/train") {
    screen = <TrainRoute team={activeTeam} onNavigate={navigate} />;
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
    <AppShell
      pathname={activePath}
      teams={teams}
      teamId={teamId}
      teamsLoading={teamsLoading}
      teamSwitchDisabled={activeSessionLock}
      onTeamChange={selectTeam}
      onNavigate={navigate}
    >
      {screen}
    </AppShell>
  );
}
