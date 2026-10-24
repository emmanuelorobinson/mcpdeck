"use client";

import {
  ArrowRight,
  ArrowUpRight,
  Boxes,
  Download,
  RefreshCw,
  Settings2,
  Waypoints,
} from "lucide-react";
import { motion } from "framer-motion";
import Link from "next/link";
import { useState } from "react";
import { EventItem } from "@/components/event-item";
import { HarnessDot, HarnessDots } from "@/components/harness";
import { ServerDetailSheet } from "@/components/server-detail-sheet";
import { ServerGlyph } from "@/components/server-glyph";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { trpc } from "@/lib/trpc";
import { useRefresh } from "@/lib/use-refresh";
import { cn, timeAgo } from "@/lib/utils";

function Stat({
  label,
  value,
  hint,
  icon,
  accent,
  delay,
}: {
  label: string;
  value: React.ReactNode;
  hint: string;
  icon: React.ReactNode;
  accent?: string;
  delay: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      className="rounded-xl border border-border bg-card p-4"
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">
          {label}
        </span>
        <span className={cn("text-muted-foreground", accent)}>{icon}</span>
      </div>
      <p className="mt-3 text-2xl font-semibold leading-none tracking-tight tabular-nums">
        {value}
      </p>
      <p className="mt-2 text-xs text-muted-foreground">{hint}</p>
    </motion.div>
  );
}

function Panel({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card">
      <header className="flex items-center justify-between gap-4 border-b border-border px-4 py-3">
        <div>
          <h2 className="text-sm font-medium text-foreground">{title}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

export default function OverviewPage() {
  const refresh = useRefresh();
  const toast = useToast();
  const [selected, setSelected] = useState<string | null>(null);

  const { data: overview, isLoading } = trpc.system.overview.useQuery();
  const { data: servers = [] } = trpc.servers.list.useQuery();
  const { data: harnesses = [] } = trpc.harnesses.list.useQuery();
  const { data: drift = [] } = trpc.harnesses.driftAll.useQuery();
  const { data: events = [] } = trpc.activity.list.useQuery({ limit: 7 });

  const syncAll = trpc.harnesses.scanAll.useMutation();

  const highlight = [...servers]
    .sort((a, b) => {
      if (a.isFavorite !== b.isFavorite) return a.isFavorite ? -1 : 1;
      if (a.installs.length !== b.installs.length) {
        return b.installs.length - a.installs.length;
      }
      if (a.updatedAt !== b.updatedAt) return b.updatedAt - a.updatedAt;
      return a.name.localeCompare(b.name);
    })
    .slice(0, 6);

  const driftHarnesses = drift.filter(
    (item) =>
      item.missingInConfig.length ||
      item.missingInLibrary.length ||
      item.drifted.length,
  );

  async function handleSync() {
    try {
      const result = await syncAll.mutateAsync();
      await refresh();
      const imported = result.results.reduce(
        (total, item) => total + item.imported,
        0,
      );
      const linked = result.results.reduce(
        (total, item) => total + item.linked,
        0,
      );
      const errors = result.results.filter((item) => item.error).length;
      toast.push({
        title: "Harness scan complete",
        description: `${imported} imported · ${linked} linked${
          errors ? ` · ${errors} failed` : ""
        }`,
        tone: errors ? "error" : "success",
      });
    } catch (cause) {
      toast.push({
        title: "Sync failed",
        description: cause instanceof Error ? cause.message : String(cause),
        tone: "error",
      });
    }
  }

  return (
    <div>
      <section className="mb-8 flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="label-mono mb-2">Control room</p>
          <h1 className="max-w-2xl text-3xl font-semibold leading-tight tracking-tight text-foreground sm:text-4xl">
            One deck for every MCP.
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
            Store each server once, then sync and install it into every harness
            on this machine. No more copy-pasting JSON between config files.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            variant="secondary"
            onClick={handleSync}
            loading={syncAll.isPending}
          >
            <RefreshCw className="size-3.5" /> Sync all
          </Button>
          <Link
            href="/servers"
            className={buttonVariants({ variant: "primary" })}
          >
            Open library <ArrowUpRight className="size-3.5" />
          </Link>
        </div>
      </section>

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Servers"
          value={isLoading ? "—" : (overview?.serverCount ?? 0)}
          hint={`${overview?.stdioCount ?? 0} local · ${
            overview?.remoteCount ?? 0
          } remote`}
          icon={<Boxes className="size-4" />}
          delay={0}
        />
        <Stat
          label="Installations"
          value={isLoading ? "—" : (overview?.installCount ?? 0)}
          hint="across every harness"
          icon={<Download className="size-4" />}
          delay={0.04}
        />
        <Stat
          label="Harnesses"
          value={
            isLoading
              ? "—"
              : `${overview?.detectedHarnessCount ?? 0}/${
                  overview?.harnessCount ?? 0
                }`
          }
          hint="detected on this machine"
          icon={<Waypoints className="size-4" />}
          delay={0.08}
        />
        <Stat
          label="Drift"
          value={isLoading ? "—" : (overview?.driftCount ?? 0)}
          hint={
            overview?.driftCount
              ? `${driftHarnesses.length} harness${
                  driftHarnesses.length === 1 ? "" : "es"
                } out of sync`
              : "everything matches"
          }
          icon={<Settings2 className="size-4" />}
          accent={overview?.driftCount ? "text-amber" : "text-lime"}
          delay={0.12}
        />
      </div>

      {overview?.needsSetupCount ? (
        <Link
          href="/servers"
          className="mb-5 flex items-center gap-3 rounded-lg border border-amber/30 bg-amber/10 px-4 py-3 transition-colors hover:bg-amber/15"
        >
          <span className="grid size-6 place-items-center rounded-md border border-amber/30 bg-amber/15 text-xs font-medium text-amber">
            {overview.needsSetupCount}
          </span>
          <p className="text-sm text-amber">
            {overview.needsSetupCount} server
            {overview.needsSetupCount === 1 ? " is" : "s are"} missing required
            credentials. Add them before installing.
          </p>
          <ArrowRight className="ml-auto size-3.5 text-amber/70" />
        </Link>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <Panel
          title="Your library"
          description={`${servers.length} servers stored locally`}
          action={
            <Link
              href="/servers"
              className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              View all <ArrowRight className="size-3" />
            </Link>
          }
        >
          {highlight.length ? (
            <div className="divide-y divide-border">
              {highlight.map((server) => (
                <button
                  key={server.id}
                  onClick={() => setSelected(server.id)}
                  className="group flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40"
                >
                  <ServerGlyph
                    category={server.category}
                    name={server.name}
                    size="sm"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-medium text-foreground">
                        {server.name}
                      </span>
                      {server.missingRequired.length ? (
                        <span className="size-1.5 rounded-full bg-amber" />
                      ) : null}
                    </div>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {server.description || server.slug}
                    </p>
                  </div>
                  <HarnessDots
                    ids={server.installs.map((install) => install.harnessId)}
                    max={4}
                  />
                  <span className="hidden w-14 text-right text-xs tabular-nums text-muted-foreground sm:block">
                    {server.installs.length || "—"}
                  </span>
                  <ArrowUpRight className="size-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                </button>
              ))}
            </div>
          ) : (
            <div className="px-5 py-12 text-center">
              <p className="text-sm text-muted-foreground">No servers yet.</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Add one manually or discover a curated server.
              </p>
              <div className="mt-4 flex justify-center gap-2">
                <Link
                  href="/servers"
                  className={buttonVariants({ variant: "primary", size: "sm" })}
                >
                  Add server
                </Link>
                <Link
                  href="/discover"
                  className={buttonVariants({
                    variant: "secondary",
                    size: "sm",
                  })}
                >
                  Discover
                </Link>
              </div>
            </div>
          )}
        </Panel>

        <Panel
          title="Harness coverage"
          description="Where your MCPs can live"
          action={
            <Link
              href="/harnesses"
              className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              Matrix <ArrowRight className="size-3" />
            </Link>
          }
        >
          <div className="divide-y divide-border">
            {harnesses.map((harness) => (
              <Link
                key={harness.id}
                href="/harnesses"
                className={cn(
                  "flex items-center gap-2.5 px-4 py-2.5 transition-colors hover:bg-muted/40",
                  !harness.detected && "opacity-50",
                )}
              >
                <HarnessDot id={harness.id} />
                <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                  {harness.name}
                </span>
                {harness.error ? (
                  <Badge tone="rose" mono>
                    error
                  </Badge>
                ) : null}
                <span className="text-xs tabular-nums text-muted-foreground">
                  {harness.managedCount}/{harness.serverCount}
                </span>
                <div className="h-1 w-10 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-foreground/30"
                    style={{
                      width: `${Math.min(
                        100,
                        harness.serverCount
                          ? (harness.managedCount /
                              Math.max(harness.serverCount, 1)) *
                              100
                          : 0,
                      )}%`,
                    }}
                  />
                </div>
              </Link>
            ))}
          </div>
        </Panel>
      </div>

      <div className="mt-4">
        <Panel
          title="Recent activity"
          description="Installs, syncs and edits"
          action={
            <Link
              href="/activity"
              className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              Full log <ArrowRight className="size-3" />
            </Link>
          }
        >
          {events.length ? (
            <div className="grid divide-y divide-border px-4 sm:grid-cols-2 sm:gap-x-8 sm:divide-y-0">
              {events.map((event) => (
                <EventItem key={event.id} event={event} compact />
              ))}
            </div>
          ) : (
            <p className="px-4 py-8 text-center text-xs text-muted-foreground">
              No activity yet. Install a server or run a scan.
            </p>
          )}
        </Panel>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        {[
          {
            href: "/servers",
            icon: Boxes,
            title: "Add a server",
            description: "Store a command or remote URL once.",
          },
          {
            href: "/discover",
            icon: Download,
            title: "Discover MCPs",
            description: "Curated servers with prefilled config.",
          },
          {
            href: "/harnesses",
            icon: Waypoints,
            title: "Close the drift",
            description: "See exactly which configs differ.",
          },
        ].map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className="group flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3.5 transition-colors hover:bg-muted/40"
          >
            <card.icon className="size-4 text-muted-foreground group-hover:text-foreground" />
            <div>
              <p className="text-sm text-foreground">{card.title}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {card.description}
              </p>
            </div>
            <ArrowUpRight className="ml-auto size-3.5 text-muted-foreground" />
          </Link>
        ))}
      </div>

      <p className="mt-8 text-center text-xs text-muted-foreground">
        Last scan {timeAgo(overview?.lastSyncAt)} · local database · secrets
        encrypted
      </p>

      <ServerDetailSheet
        serverId={selected}
        onClose={() => setSelected(null)}
      />
    </div>
  );
}
