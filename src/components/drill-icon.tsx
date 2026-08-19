import type { ComponentType } from "react";
import {
  Activity,
  ArrowLeftRight,
  ArrowUp,
  Crosshair,
  Flag,
  Gauge,
  Hand,
  Hash,
  Move,
  Navigation,
  Repeat2,
  Route,
  Send,
  Star,
  Timer,
  TimerReset,
  Triangle,
  Zap,
} from "lucide-react";

type IconComponent = ComponentType<{
  size?: number;
  className?: string;
  "aria-hidden"?: boolean;
}>;

const ICONS: Record<string, IconComponent> = {
  timer: Timer,
  sprint: Gauge,
  speed: Gauge,
  agility: Move,
  shuttle: ArrowLeftRight,
  route: Route,
  catch: Hand,
  accuracy: Crosshair,
  throw: Send,
  flag: Flag,
  pursuit: Navigation,
  jump: ArrowUp,
  power: Zap,
  reps: Repeat2,
  count: Hash,
  rating: Star,
  cone: Triangle,
  stopwatch: TimerReset,
};

export type DrillIconSource = {
  icon?: string | null;
  category?: string | null;
};

export function DrillIcon({
  drill,
  size = 18,
  className,
}: {
  drill: DrillIconSource;
  size?: number;
  className?: string;
}) {
  const iconKey = drill.icon?.trim().toLowerCase() ?? "";
  const categoryKey = drill.category?.trim().toLowerCase() ?? "";
  const Icon = ICONS[iconKey] ?? ICONS[categoryKey] ?? Activity;
  return <Icon aria-hidden={true} size={size} className={className} />;
}
