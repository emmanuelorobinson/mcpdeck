"use client";

import type { EventDTO } from "@mcpdeck/shared";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  FolderInput,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { cn, timeAgo } from "@/lib/utils";

const ICONS: Record<EventDTO["kind"], LucideIcon> = {
  install: ArrowDownToLine,
  uninstall: ArrowUpFromLine,
  sync: RefreshCw,
  import: FolderInput,
  create: Plus,
  delete: Trash2,
  update: Pencil,
};

export function EventItem({
  event,
  compact = false,
}: {
  event: EventDTO;
  compact?: boolean;
}) {
  const Icon = ICONS[event.kind] ?? RefreshCw;
  const error = event.status === "error";
  return (
    <div className={cn("flex gap-3", compact ? "py-2.5" : "py-3.5")}>
      <span
        className={cn(
          "mt-0.5 grid size-6 shrink-0 place-items-center rounded-md border",
          error
            ? "border-destructive/30 bg-destructive/10 text-destructive"
            : "border-border bg-muted/40 text-muted-foreground",
        )}
      >
        <Icon className="size-3" strokeWidth={1.9} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm leading-5 text-foreground">{event.message}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {timeAgo(event.createdAt)}
          {error ? " · failed" : ""}
        </p>
      </div>
    </div>
  );
}
