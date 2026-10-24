"use client";

import type { EventDTO } from "@mcpdeck/shared";
import { Activity, ArrowDownToLine, RefreshCw, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { EmptyState, PageHeader } from "@/components/brand";
import { EventItem } from "@/components/event-item";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";

type Filter = "all" | "install" | "sync" | "edit" | "errors";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "Everything" },
  { id: "install", label: "Installs" },
  { id: "sync", label: "Syncs" },
  { id: "edit", label: "Edits" },
  { id: "errors", label: "Errors" },
];

function matches(event: EventDTO, filter: Filter) {
  if (filter === "all") return true;
  if (filter === "errors") return event.status === "error";
  if (filter === "install") return event.kind === "install" || event.kind === "uninstall";
  if (filter === "sync") return event.kind === "sync" || event.kind === "import";
  return ["create", "update", "delete"].includes(event.kind);
}

function dayLabel(timestamp: number) {
  const date = new Date(timestamp);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
  if (sameDay(date, today)) return "Today";
  if (sameDay(date, yesterday)) return "Yesterday";
  return date.toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}

export default function ActivityPage() {
  const [filter, setFilter] = useState<Filter>("all");
  const { data: events = [], isLoading } = trpc.activity.list.useQuery({
    limit: 200,
  });

  const filtered = useMemo(
    () => events.filter((event) => matches(event, filter)),
    [events, filter],
  );

  const groups = useMemo(() => {
    const map = new Map<string, EventDTO[]>();
    for (const event of filtered) {
      const key = dayLabel(event.createdAt);
      const list = map.get(key) ?? [];
      list.push(event);
      map.set(key, list);
    }
    return [...map.entries()];
  }, [filtered]);

  const installs = events.filter(
    (event) => event.kind === "install" || event.kind === "uninstall",
  ).length;
  const syncs = events.filter((event) => event.kind === "sync").length;
  const errors = events.filter((event) => event.status === "error").length;

  return (
    <div>
      <PageHeader
        eyebrow="Log"
        title="Activity"
        description="Every install, sync and configuration change, recorded locally. Useful when a harness suddenly behaves differently."
        actions={
          <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-1.5">
            <Activity className="size-3.5 text-lime" />
            <span className="text-xs text-muted-foreground">
              {events.length} events
            </span>
          </div>
        }
      />

      <div className="mb-4 grid grid-cols-3 gap-2">
        {[
          {
            label: "Installs",
            value: installs,
            icon: <ArrowDownToLine className="h-3 w-3" />,
          },
          {
            label: "Syncs",
            value: syncs,
            icon: <RefreshCw className="h-3 w-3" />,
          },
          {
            label: "Errors",
            value: errors,
            icon: <Search className="h-3 w-3" />,
          },
        ].map((stat) => (
          <div
            key={stat.label}
            className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5"
          >
            <span className="text-muted-foreground">{stat.icon}</span>
            <div>
              <p className="text-xs text-muted-foreground">{stat.label}</p>
              <p className="mt-0.5 text-lg font-semibold tabular-nums">
                {stat.value}
              </p>
            </div>
          </div>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        {FILTERS.map((item) => (
          <button
            key={item.id}
            onClick={() => setFilter(item.id)}
            className={cn(
              "rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors",
              filter === item.id
                ? item.id === "errors"
                  ? "border-destructive/30 bg-destructive/10 text-destructive"
                  : "border-border bg-secondary text-secondary-foreground"
                : "border-transparent text-muted-foreground hover:bg-muted/50 hover:text-foreground",
            )}
          >
            {item.label}
          </button>
        ))}
        <span className="ml-auto text-xs tabular-nums text-muted-foreground">
          {filtered.length} shown
        </span>
      </div>

      {isLoading ? (
        <div className="skeleton h-80 rounded-xl border border-border" />
      ) : groups.length ? (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          {groups.map(([label, items]) => (
            <div key={label}>
              <div className="border-y border-border bg-muted/40 px-4 py-2 first:border-t-0">
                <span className="text-xs font-medium text-muted-foreground">
                  {label}
                </span>
              </div>
              <div className="divide-y divide-border px-4">
                {items.map((event) => (
                  <EventItem key={event.id} event={event} />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<Activity className="h-4 w-4" />}
          title="No events yet"
          description="Install a server or scan a harness and the timeline will fill up."
          action={
            filter !== "all" ? (
              <Button variant="secondary" onClick={() => setFilter("all")}>
                Show everything
              </Button>
            ) : undefined
          }
        />
      )}

      <p className="mt-5 text-center text-xs text-muted-foreground">
        The newest 200 events are kept in the local database
      </p>
    </div>
  );
}
