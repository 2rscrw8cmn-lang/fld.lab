import { BarChart3, Dumbbell, Library, Settings, Timer, UsersRound } from "lucide-react";

import type { AppRoute } from "@/app/routes";

const icons = {
  "/roster": UsersRound,
  "/train": Timer,
  "/data": BarChart3,
  "/drills": Library,
  "/settings": Settings,
};

export function RoutePlaceholder({ route }: { route: AppRoute }) {
  const Icon = icons[route.path as keyof typeof icons] ?? Dumbbell;

  return (
    <section className="mx-auto max-w-[1160px] px-4 py-7 md:px-7 md:py-9">
      <div className="max-w-2xl">
        <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-surface text-accent">
          <Icon aria-hidden={true} size={19} strokeWidth={1.8} />
        </div>
        <h1 className="text-[26px] font-extrabold tracking-[-0.04em] md:text-[30px]">{route.label}</h1>
        <p className="mt-1 text-sm text-text-muted">{route.description}</p>
      </div>

      <div className="mt-8 border-t border-border pt-5 text-sm text-text-muted">
        This area is ready for its Phase 1 feature implementation.
      </div>
    </section>
  );
}
