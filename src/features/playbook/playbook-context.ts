export type PlaybookFormat = "5v5" | "6v6";

type ActivePlaybookContext = {
  id: string;
  format: PlaybookFormat;
};

let activePlaybook: ActivePlaybookContext | null = null;

export function setActivePlaybookContext(next: ActivePlaybookContext | null) {
  activePlaybook = next;
}

export function getActivePlaybookContext() {
  return activePlaybook;
}
