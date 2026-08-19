import type { DiagramPlayer, PlayDiagram } from "@/features/playbook/playbook-model";

export const PRIMARY_PLAYER_COLOR = "#7C3AED";

const POSITION_COLORS: Record<string, string> = {
  X: "#38BDF8",
  Y: "#34D399",
  Z: "#FB923C",
  C: "#60A5FA",
  QB: "#FBBF24",
};

const FALLBACK_COLORS = ["#38BDF8", "#34D399", "#FB923C", "#60A5FA", "#FB7185"];

function hashLabel(label: string) {
  return [...label].reduce((hash, character) => ((hash * 31) + character.charCodeAt(0)) >>> 0, 7);
}

export function playerColor(player: Pick<DiagramPlayer, "label">, primary = false) {
  if (primary) return PRIMARY_PLAYER_COLOR;
  const label = player.label.trim().toUpperCase();
  return POSITION_COLORS[label] ?? FALLBACK_COLORS[hashLabel(label) % FALLBACK_COLORS.length];
}

export function playerTextColor(primary: boolean) {
  return primary ? "#FFFFFF" : "#0F172A";
}

export function playerForAssignment(diagram: PlayDiagram, playerId: string) {
  return diagram.players.find((player) => player.id === playerId) ?? null;
}

export function isPrimaryPlayer(diagram: PlayDiagram, playerId: string) {
  return diagram.primary_target_player_id === playerId;
}
