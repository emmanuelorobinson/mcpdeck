import {
  Boxes,
  Database,
  Globe,
  PenTool,
  Server,
  Sparkles,
  SquareCheckBig,
  Terminal,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

const CATEGORY_STYLES: Record<
  string,
  { icon: LucideIcon; className: string }
> = {
  Developer: {
    icon: Terminal,
    className: "border-lime/20 bg-lime/10 text-lime",
  },
  Data: {
    icon: Database,
    className: "border-cyan/20 bg-cyan/10 text-cyan",
  },
  Web: {
    icon: Globe,
    className: "border-cyan/20 bg-cyan/10 text-cyan",
  },
  AI: {
    icon: Sparkles,
    className: "border-violet/20 bg-violet/10 text-violet",
  },
  Productivity: {
    icon: SquareCheckBig,
    className: "border-amber/20 bg-amber/10 text-amber",
  },
  Infra: {
    icon: Server,
    className: "border-rose/20 bg-rose/10 text-rose",
  },
  Design: {
    icon: PenTool,
    className: "border-violet/20 bg-violet/10 text-violet",
  },
  General: {
    icon: Boxes,
    className: "border-border bg-muted/40 text-muted-foreground",
  },
};

function monogram(name: string) {
  const words = name
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length > 1) {
    return `${words[0][0]}${words[1][0]}`.toUpperCase();
  }
  return name.replace(/[^a-zA-Z0-9]/g, "").slice(0, 2).toUpperCase() || "?";
}

export function ServerGlyph({
  category,
  name,
  size = "md",
  className,
}: {
  category: string;
  name?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const style = CATEGORY_STYLES[category] ?? CATEGORY_STYLES.General;
  const box =
    size === "lg"
      ? "size-12 rounded-xl"
      : size === "sm"
        ? "size-7 rounded-md"
        : "size-9 rounded-lg";
  const text =
    size === "lg" ? "text-xs" : size === "sm" ? "text-[10px]" : "text-[11px]";

  if ((!CATEGORY_STYLES[category] || category === "General") && name) {
    return (
      <span
        className={cn(
          "grid shrink-0 place-items-center border border-border bg-muted/40 font-medium text-muted-foreground",
          box,
          text,
          className,
        )}
        aria-hidden="true"
      >
        {monogram(name)}
      </span>
    );
  }

  const Icon = style.icon;
  const icon =
    size === "lg" ? "size-5" : size === "sm" ? "size-3.5" : "size-4";

  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center border",
        box,
        style.className,
        className,
      )}
    >
      <Icon className={icon} strokeWidth={1.8} />
    </span>
  );
}
