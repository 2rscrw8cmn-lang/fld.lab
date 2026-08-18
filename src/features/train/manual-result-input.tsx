import { Minus, Plus } from "lucide-react";

import type { DrillDefinition } from "@/lib/api";
import type { ManualValues } from "@/features/train/manual-result";

type Props = {
  definition: DrillDefinition;
  values: ManualValues;
  onChange: (key: string, value: string) => void;
};

type NumberFieldProps = {
  label: string;
  value: string;
  unit?: string | null;
  step?: number | "any";
  min?: number;
  max?: number;
  integer?: boolean;
  onChange: (value: string) => void;
};

function NumberField({ label, value, unit, integer = false, onChange }: NumberFieldProps) {
  return (
    <label className="block w-full">
      <span className="mb-2 block text-[11px] font-bold uppercase tracking-[0.08em] text-text-muted">{label}</span>
      <div className="flex min-h-[76px] items-center overflow-hidden rounded-xl border border-border bg-background focus-within:ring-2 focus-within:ring-accent">
        <input
          type="text"
          inputMode={integer ? "numeric" : "decimal"}
          autoComplete="off"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="min-w-0 flex-1 bg-transparent px-4 py-3 text-[34px] font-black tabular-nums tracking-[-0.04em] text-text-primary outline-none sm:text-[42px]"
        />
        {unit && <span className="shrink-0 border-l border-border px-4 text-sm font-bold text-text-muted">{unit}</span>}
      </div>
    </label>
  );
}

function ratingOptions(definition: DrillDefinition) {
  const { min, max, step } = definition.measurement;
  if (min === undefined || max === undefined || step === undefined || step <= 0) return [];
  const count = Math.floor((max - min) / step + 1e-9) + 1;
  if (count < 2 || count > 10) return [];
  return Array.from({ length: count }, (_, index) => Number((min + index * step).toFixed(8)));
}

function parsedWholeNumber(value: string | undefined, min: number, max: number) {
  if (value === undefined || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : null;
}

function SuccessesAttemptsInput({ definition, values, onChange }: Props) {
  const total = definition.measurement.total_attempts ?? 0;
  const current = parsedWholeNumber(values.successes, 0, total);
  const quickChoices = total > 0 && total <= 12
    ? Array.from({ length: total + 1 }, (_, index) => index)
    : [];

  const adjust = (delta: number) => {
    const base = current ?? 0;
    const next = Math.min(total, Math.max(0, base + delta));
    onChange("successes", String(next));
  };

  return (
    <div className="w-full max-w-[620px]">
      <div className="text-center">
        <div className="text-[10px] font-bold uppercase tracking-[0.1em] text-text-muted">Successful</div>
        <div className="mt-1 flex items-baseline justify-center gap-2 tabular-nums">
          <span className="text-[64px] font-black leading-none tracking-[-0.06em] text-text-primary sm:text-[76px]">
            {current ?? "—"}
          </span>
          <span className="text-[24px] font-extrabold tracking-[-0.03em] text-text-muted sm:text-[28px]">/ {total}</span>
        </div>
      </div>

      {quickChoices.length > 0 ? (
        <div className="mt-5 grid grid-cols-4 gap-2 sm:grid-cols-6">
          {quickChoices.map((option) => {
            const selected = current === option;
            return (
              <button
                key={option}
                type="button"
                aria-pressed={selected}
                onClick={() => onChange("successes", String(option))}
                className={`min-h-[54px] rounded-xl border text-lg font-black tabular-nums transition-colors sm:min-h-[58px] ${
                  selected
                    ? "border-accent bg-accent text-white"
                    : "border-border bg-background text-text-primary hover:bg-surface-elevated"
                }`}
              >
                {option}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="mt-5 grid grid-cols-[76px_minmax(0,1fr)_76px] overflow-hidden rounded-xl border border-border bg-background">
          <button
            type="button"
            aria-label="Decrease successes"
            disabled={current === 0}
            onClick={() => adjust(-1)}
            className="flex min-h-[76px] items-center justify-center border-r border-border text-text-primary transition-colors hover:bg-surface-elevated disabled:cursor-not-allowed disabled:opacity-35"
          >
            <Minus size={24} />
          </button>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="off"
            aria-label={`Successes out of ${total}`}
            value={values.successes ?? ""}
            onChange={(event) => onChange("successes", event.target.value)}
            className="min-w-0 bg-transparent px-3 text-center text-[42px] font-black tabular-nums tracking-[-0.04em] text-text-primary outline-none"
          />
          <button
            type="button"
            aria-label="Increase successes"
            disabled={current === total}
            onClick={() => adjust(1)}
            className="flex min-h-[76px] items-center justify-center border-l border-border text-text-primary transition-colors hover:bg-surface-elevated disabled:cursor-not-allowed disabled:opacity-35"
          >
            <Plus size={24} />
          </button>
        </div>
      )}

      <p className="mt-3 text-center text-xs text-text-muted">
        {quickChoices.length > 0
          ? `Tap the number completed successfully across ${total} attempts.`
          : `Record the number completed successfully across ${total} attempts.`}
      </p>
    </div>
  );
}

export function ManualResultInput({ definition, values, onChange }: Props) {
  const measurement = definition.measurement;

  if (measurement.type === "successes_attempts") {
    return <SuccessesAttemptsInput definition={definition} values={values} onChange={onChange} />;
  }

  if (measurement.type === "distance") {
    return (
      <div className="w-full max-w-[560px]">
        <NumberField
          label="Distance"
          value={values.distance ?? ""}
          unit={measurement.unit}
          min={0}
          step="any"
          onChange={(value) => onChange("distance", value)}
        />
      </div>
    );
  }

  if (measurement.type === "count") {
    return (
      <div className="w-full max-w-[560px]">
        <NumberField
          label="Count"
          value={values.count ?? ""}
          unit={measurement.unit}
          min={0}
          step={1}
          integer
          onChange={(value) => onChange("count", value)}
        />
      </div>
    );
  }

  if (measurement.type === "rating") {
    const options = ratingOptions(definition);
    if (options.length) {
      return (
        <div className="w-full max-w-[620px]">
          <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.08em] text-text-muted">Rating</div>
          <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(options.length, 5)}, minmax(0, 1fr))` }}>
            {options.map((option) => {
              const selected = values.rating === String(option);
              return (
                <button
                  key={option}
                  type="button"
                  onClick={() => onChange("rating", String(option))}
                  className={`min-h-[64px] rounded-xl border text-xl font-black tabular-nums transition-colors ${selected ? "border-accent bg-accent text-white" : "border-border bg-background text-text-primary hover:bg-surface-elevated"}`}
                >
                  {option}
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-center text-xs text-text-muted">
            {measurement.min}–{measurement.max}{measurement.unit ? ` ${measurement.unit}` : ""}
          </p>
        </div>
      );
    }

    return (
      <div className="w-full max-w-[560px]">
        <NumberField
          label="Rating"
          value={values.rating ?? ""}
          unit={measurement.unit}
          min={measurement.min}
          max={measurement.max}
          step={measurement.step ?? "any"}
          onChange={(value) => onChange("rating", value)}
        />
      </div>
    );
  }

  if (measurement.type === "custom_numeric") {
    return (
      <div className="grid w-full max-w-[680px] gap-4 sm:grid-cols-2">
        {(measurement.fields ?? []).map((field) => (
          <NumberField
            key={field.key}
            label={field.label}
            value={values[field.key] ?? ""}
            unit={field.unit}
            step="any"
            onChange={(value) => onChange(field.key, value)}
          />
        ))}
      </div>
    );
  }

  return null;
}
