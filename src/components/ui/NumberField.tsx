"use client";
import { NumberField as BaseNumberField } from "@base-ui/react/number-field";
import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

export type NumberFieldProps = {
  value: number | null;
  onChange: (value: number | null) => void;
  min?: number;
  max?: number;
  step?: number;
  /** Unit suffix shown after the number, e.g. "days". */
  unit?: string;
  disabled?: boolean;
  invalid?: boolean;
  name?: string;
  id?: string;
  "aria-label"?: string;
  className?: string;
};

const stepper =
  "pressable grid h-full w-11 shrink-0 place-items-center text-accent-text outline-none hover:bg-fill-1 active:bg-fill-2 data-[disabled]:opacity-30 data-[disabled]:pointer-events-none";

/** Numeric input with −/+ steppers and an optional unit. Arrow keys step; values clamp to min/max. */
export function NumberField({ value, onChange, min, max, step = 1, unit, disabled, invalid, name, id, className, ...aria }: NumberFieldProps) {
  return (
    <BaseNumberField.Root
      value={value}
      onValueChange={(v) => onChange(v)}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      name={name}
      id={id}
      className={className}
    >
      <BaseNumberField.Group
        aria-invalid={invalid || undefined}
        className="flex h-11 w-full items-stretch overflow-hidden rounded-sm border-[0.5px] border-hairline bg-surface-2 shadow-e1 transition-[box-shadow,border-color] duration-150 focus-within:border-accent focus-within:shadow-[0_0_0_3px_var(--focus-ring)] aria-invalid:border-danger data-[disabled]:opacity-50"
      >
        <BaseNumberField.Decrement aria-label="Decrease" className={cn(stepper, "border-r-[0.5px] border-separator")}>
          <Minus size={18} strokeWidth={2.4} />
        </BaseNumberField.Decrement>
        <label className="flex min-w-0 flex-1 cursor-text items-center justify-center gap-1.5 px-2">
          <BaseNumberField.Input
            aria-label={aria["aria-label"]}
            inputMode="numeric"
            className="w-full min-w-0 bg-transparent text-center text-body font-medium text-fg tabular-nums outline-none"
            style={{ maxWidth: `${Math.max(2, String(value ?? "").length + 1)}ch` }}
          />
          {unit && <span className="shrink-0 text-body text-fg-3">{unit}</span>}
        </label>
        <BaseNumberField.Increment aria-label="Increase" className={cn(stepper, "border-l-[0.5px] border-separator")}>
          <Plus size={18} strokeWidth={2.4} />
        </BaseNumberField.Increment>
      </BaseNumberField.Group>
    </BaseNumberField.Root>
  );
}
