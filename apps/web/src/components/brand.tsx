import { cn } from "@/lib/utils";

export function BrandMark({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <svg
        viewBox="0 0 28 28"
        fill="none"
        className="h-7 w-7"
        aria-hidden="true"
      >
        <rect x="1" y="1" width="11" height="11" rx="3" fill="#bef264" />
        <rect x="16" y="1" width="11" height="11" rx="3" fill="#27272a" />
        <rect x="1" y="16" width="11" height="11" rx="3" fill="#27272a" />
        <rect x="16" y="16" width="11" height="11" rx="3" fill="#fafafa" />
        <rect
          x="4.5"
          y="4.5"
          width="4"
          height="4"
          rx="1"
          fill="#09090b"
          opacity="0.55"
        />
      </svg>
      <span className="text-[15px] font-semibold tracking-[-0.02em] text-foreground">
        mcpdeck<span className="text-lime">.</span>
      </span>
    </span>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow ? <p className="label-mono mb-2">{eyebrow}</p> : null}
        <h1 className="text-2xl font-semibold leading-tight tracking-tight text-foreground sm:text-3xl">
          {title}
        </h1>
        {description ? (
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {actions}
        </div>
      ) : null}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/20 px-6 py-16 text-center">
      <div className="mb-4 grid h-11 w-11 place-items-center rounded-xl border border-border bg-background text-muted-foreground">
        {icon}
      </div>
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description ? (
        <p className="mt-1.5 max-w-sm text-sm leading-5 text-muted-foreground">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function Divider({ className }: { className?: string }) {
  return <div className={cn("h-px w-full bg-border", className)} />;
}
