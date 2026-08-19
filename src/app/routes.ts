export type AppRoute = {
  path: string;
  label: string;
  description: string;
};

export const APP_ROUTES: AppRoute[] = [
  { path: "/", label: "Home", description: "Launch or resume field work." },
  { path: "/roster", label: "Roster", description: "Manage athletes and team membership." },
  { path: "/train", label: "Train", description: "Capture drill results on the field." },
  { path: "/data", label: "Data", description: "Review athlete and team performance." },
  { path: "/playbook", label: "Plays", description: "Build and reference structured flag-football plays." },
  { path: "/drills", label: "Drills", description: "Browse and configure drills." },
  { path: "/settings", label: "Settings", description: "Manage team and app preferences." }
];

export function getRoute(pathname: string): AppRoute {
  return APP_ROUTES.find((route) => route.path === pathname) ?? APP_ROUTES[0];
}
