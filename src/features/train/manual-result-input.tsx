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

function NumberField({ label, value, unit, step = "any", min, max, integer = false, onChange }: NumberFieldProps) {
  return (
    <label className="block w-full">
      <span className="mb-2 block text-[11px] font-bold uppercase tracking-[0.08em] text-text-muted">{label}</span>
      <div className="flex min-h-[76px] items-center overflow-hidden rounded-xl border border-border bg-background focus-within:ring-2 focus-within:ring-accent">
        <input
          type="number"
          inputMode={integer ? "numeric" : "decimal"}
          value={value}
          min={min}
          max={max}
          step={step}
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

export function ManualResultInput({ definition, values, onChange }: Props) {
  const measurement = definition.measurement;

  if (measurement.type === "successes_attempts") {
    const total = measurement.total_attempts ?? 0;
    return (
      <div className="w-full max-w-[560px]">
        <NumberField
          label="Successes"
          value={values.successes ?? ""}
          unit={`of ${total}`}
          min={0}
          max={total}
          step={1}
          integer
          onChange={(value) => onChange("successes", value)}
        />
        <p className="mt-2 text-center text-xs text-text-muted">Enter the number completed successfully across {total} attempts.</p>
      </div>
    );
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
