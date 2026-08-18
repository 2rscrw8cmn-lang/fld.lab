import { useEffect, useMemo, useState } from "react";

import { getRoute } from "@/app/routes";
import { AppShell } from "@/components/app-shell";
import { RoutePlaceholder } from "@/components/route-placeholder";
import { HomeScreen } from "@/features/home/home-screen";
import { RosterScreen } from "@/features/roster/roster-screen";
import { FirstTeamSetup } from "@/features/teams/first-team-setup";
import { listTeams, type Team } from "@/lib/api";

const TEAM_STORAGE_KEY = "fld-lab:last-team-id";

export default function App() {
  const [pathname, setPathname] = useState(() => window.location.pathname);
  const [teams, setTeams] = useState<Team[]>([]);
  const [teamsLoading, setTeamsLoading] = useState(true);
  const [teamId, setTeamId] = useState("");

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

  const navigate = (path: string) => {
    if (path === pathname) return;
    window.history.pushState({}, "", path);
    setPathname(path);
    window.scrollTo({ top: 0, behavior: "auto" });
  };

  const selectTeam = (nextTeamId: string) => {
    setTeamId(nextTeamId);
    if (nextTeamId) window.localStorage.setItem(TEAM_STORAGE_KEY, nextTeamId);
  };

  const handleTeamCreated = (team: Team) => {
    setTeams((current) => [...current, team]);
    setTeamId(team.id);
    window.localStorage.setItem(TEAM_STORAGE_KEY, team.id);
  };

  const route = getRoute(pathname);
  const activePath = route.path;
  const activeTeam = useMemo(() => teams.find((team) => team.id === teamId) ?? null, [teamId, teams]);

  let screen = <RoutePlaceholder route={route} />;
  if (activePath === "/") screen = <HomeScreen onNavigate={navigate} team={activeTeam} />;
  if (activePath === "/roster") {
    screen = teamsLoading
      ? <RosterScreen team={null} />
      : activeTeam
        ? <RosterScreen team={activeTeam} />
        : <FirstTeamSetup onCreated={handleTeamCreated} />;
  }

  return (
    <AppShell
      pathname={activePath}
      teams={teams}
      teamId={teamId}
      teamsLoading={teamsLoading}
      onTeamChange={selectTeam}
      onNavigate={navigate}
    >
      {screen}
    </AppShell>
  );
}
