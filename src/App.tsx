import { useEffect, useState } from "react";

import { getRoute } from "@/app/routes";
import { AppShell } from "@/components/app-shell";
import { RoutePlaceholder } from "@/components/route-placeholder";
import { HomeScreen } from "@/features/home/home-screen";

export default function App() {
  const [pathname, setPathname] = useState(() => window.location.pathname);
  const [team, setTeam] = useState("U10 Purple — Fall 2026");

  useEffect(() => {
    const handlePopState = () => setPathname(window.location.pathname);
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const navigate = (path: string) => {
    if (path === pathname) return;
    window.history.pushState({}, "", path);
    setPathname(path);
    window.scrollTo({ top: 0, behavior: "instant" });
  };

  const route = getRoute(pathname);
  const activePath = route.path;

  return (
    <AppShell
      pathname={activePath}
      team={team}
      onTeamChange={setTeam}
      onNavigate={navigate}
    >
      {activePath === "/" ? <HomeScreen onNavigate={navigate} /> : <RoutePlaceholder route={route} />}
    </AppShell>
  );
}
