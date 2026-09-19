import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  subtitle,
  actions,
  className,
}: {
  title: string;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("mb-5 flex items-end justify-between gap-4", className)}>
      <div className="min-w-0">
        <h1 className="text-[28px] sm:text-[34px] font-bold tracking-[-0.02em] leading-none">{title}</h1>
        {subtitle && <p className="mt-2 text-[15px] text-fg-2">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  );
}
