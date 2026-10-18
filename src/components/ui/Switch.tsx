"use client";
import { Switch as BaseSwitch } from "@base-ui/react/switch";
import { useId, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export type SwitchProps = {
  checked?: boolean;
  defaultChecked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  disabled?: boolean;
  name?: string;
  /** Visible label rendered to the left (iOS settings row). Omit and pass `aria-label` for bare use. */
  label?: ReactNode;
  description?: ReactNode;
  "aria-label"?: string;
  className?: string;
};

/** iOS switch (51×31). With `label`, renders a full-width, fully-clickable settings row. */
export function Switch({ checked, defaultChecked, onCheckedChange, disabled, name, label, description, className, ...aria }: SwitchProps) {
  const id = useId();
  const control = (
    <BaseSwitch.Root
      id={id}
      name={name}
      checked={checked}
      defaultChecked={defaultChecked}
      onCheckedChange={onCheckedChange ? (c) => onCheckedChange(c) : undefined}
      disabled={disabled}
      aria-label={label ? undefined : aria["aria-label"]}
      className={cn(
        "relative inline-flex h-[31px] w-[51px] shrink-0 cursor-pointer items-center rounded-full bg-fill-3 p-0.5 outline-offset-2 transition-colors duration-200 ease-out data-[checked]:bg-accent data-[disabled]:cursor-default data-[disabled]:opacity-45",
        !label && className,
      )}
    >
      <BaseSwitch.Thumb className="block size-[27px] rounded-full bg-white shadow-[0_3px_8px_oklch(0_0_0/0.15),0_1px_1px_oklch(0_0_0/0.16)] transition-transform duration-[var(--spring-snappy-dur)] ease-[var(--spring-snappy)] data-[checked]:translate-x-5" />
    </BaseSwitch.Root>
  );
  if (!label) return control;
  return (
    <label htmlFor={id} className={cn("flex min-h-11 cursor-pointer items-center justify-between gap-4", disabled && "cursor-default", className)}>
      <span className="min-w-0">
        <span className="block text-body text-fg">{label}</span>
        {description && <span className="mt-0.5 block text-footnote text-fg-3">{description}</span>}
      </span>
      {control}
    </label>
  );
}
