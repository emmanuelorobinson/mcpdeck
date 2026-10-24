import { HARNESS_BY_ID } from "@mcpdeck/shared";
import { cn } from "@/lib/utils";

export function HarnessDot({
  id,
  size = 7,
  className,
}: {
  id: string;
  size?: number;
  className?: string;
}) {
  const harness = HARNESS_BY_ID[id];
  return (
    <span
      title={harness?.name ?? id}
      className={cn("inline-block shrink-0 rounded-full", className)}
      style={{
        width: size,
        height: size,
        background: harness?.color ?? "var(--muted-foreground)",
        boxShadow: `0 0 0 2px var(--background)`,
      }}
    />
  );
}

export function HarnessDots({
  ids,
  max = 5,
  size = 7,
}: {
  ids: string[];
  max?: number;
  size?: number;
}) {
  const visible = ids.slice(0, max);
  const overflow = ids.length - visible.length;
  return (
    <span className="inline-flex items-center gap-1">
      {visible.map((id) => (
        <HarnessDot key={id} id={id} size={size} />
      ))}
      {overflow > 0 ? (
        <span className="ml-0.5 text-xs text-muted-foreground">
          +{overflow}
        </span>
      ) : null}
    </span>
  );
}

export function HarnessChip({ id }: { id: string }) {
  const harness = HARNESS_BY_ID[id];
  if (!harness) return null;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/40 px-1.5 py-0.5 text-xs text-muted-foreground">
      <HarnessDot id={id} size={5} />
      {harness.name}
    </span>
  );
}
