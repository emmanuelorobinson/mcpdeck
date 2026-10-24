"use client";

import type { HarnessDTO, ServerDTO } from "@mcpdeck/shared";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  RefreshCw,
  Search,
  Wrench,
} from "lucide-react";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/brand";
import { HarnessDot } from "@/components/harness";
import { ServerDetailSheet } from "@/components/server-detail-sheet";
import { ServerGlyph } from "@/components/server-glyph";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { trpc } from "@/lib/trpc";
import { useRefresh } from "@/lib/use-refresh";
import { cn, shortPath, timeAgo } from "@/lib/utils";

export default function HarnessesPage() {
  const refresh = useRefresh();
  const toast = useToast();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [pendingCell, setPendingCell] = useState<string | null>(null);
  const [pendingHarness, setPendingHarness] = useState<string | null>(null);

  const { data: harnesses = [], isLoading } = trpc.harnesses.list.useQuery();
  const { data: servers = [] } = trpc.servers.list.useQuery();
  const { data: drift = [] } = trpc.harnesses.driftAll.useQuery();

  const install = trpc.servers.install.useMutation();
  const uninstall = trpc.servers.uninstall.useMutation();
  const scanAll = trpc.harnesses.scanAll.useMutation();
  const scanOne = trpc.harnesses.scan.useMutation();
  const repair = trpc.harnesses.repair.useMutation();
  const repairAll = trpc.harnesses.repairAll.useMutation();

  const driftByHarness = useMemo(
    () => new Map(drift.map((item) => [item.harnessId, item])),
    [drift],
  );

  const filteredServers = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return servers;
    return servers.filter((server) =>
      [server.name, server.slug, server.command, server.url]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(term),
    );
  }, [servers, query]);

  const totalDrift = drift.reduce(
    (total, item) =>
      total +
      item.missingInConfig.length +
      item.missingInLibrary.length +
      item.drifted.length,
    0,
  );

  async function runScanAll() {
    try {
      const result = await scanAll.mutateAsync();
      await refresh();
      const imported = result.results.reduce(
        (total, item) => total + item.imported,
        0,
      );
      const linked = result.results.reduce(
        (total, item) => total + item.linked,
        0,
      );
      const errors = result.results.filter((item) => item.error);
      toast.push({
        title: "All harnesses scanned",
        description: `${imported} imported · ${linked} linked${
          errors.length ? ` · ${errors.length} errors` : ""
        }`,
        tone: errors.length ? "error" : "success",
      });
    } catch (cause) {
      toast.push({
        title: "Scan failed",
        description: cause instanceof Error ? cause.message : String(cause),
        tone: "error",
      });
    }
  }

  async function rescan(harness: HarnessDTO) {
    setPendingHarness(harness.id);
    try {
      const result = await scanOne.mutateAsync({ harnessId: harness.id });
      await refresh();
      toast.push({
        title: `${harness.name} rescanned`,
        description: result.error
          ? result.error
          : `${result.found} found · ${result.imported} imported · ${result.linked} linked`,
        tone: result.error ? "error" : "success",
      });
    } finally {
      setPendingHarness(null);
    }
  }

  async function repairOne(harness: HarnessDTO) {
    setPendingHarness(harness.id);
    try {
      const result = await repair.mutateAsync({ harnessId: harness.id });
      await refresh();
      toast.push({
        title: `${harness.name} repaired`,
        description:
          "error" in result && result.error
            ? result.error
            : `${result.repaired} rewritten · ${result.skipped} skipped · ${result.imported} imported`,
        tone: "error" in result && result.error ? "error" : "success",
      });
    } catch (cause) {
      toast.push({
        title: "Repair failed",
        description: cause instanceof Error ? cause.message : String(cause),
        tone: "error",
      });
    } finally {
      setPendingHarness(null);
    }
  }

  async function repairEverything() {
    try {
      const results = await repairAll.mutateAsync();
      await refresh();
      const repaired = results.reduce((total, item) => total + item.repaired, 0);
      toast.push({
        title: "Drift repair complete",
        description: `${repaired} config${
          repaired === 1 ? "" : "s"
        } rewritten across your harnesses`,
        tone: "success",
      });
    } catch (cause) {
      toast.push({
        title: "Repair failed",
        description: cause instanceof Error ? cause.message : String(cause),
        tone: "error",
      });
    }
  }

  async function toggleCell(
    server: ServerDTO,
    harness: HarnessDTO,
    next: boolean,
  ) {
    const key = `${server.id}:${harness.id}`;
    if (pendingCell) return;
    if (next && server.missingRequired.length) {
      toast.push({
        title: "Missing required values",
        description: `Add ${server.missingRequired.join(", ")} before installing ${server.name}.`,
        tone: "error",
      });
      setSelected(server.id);
      return;
    }
    setPendingCell(key);
    try {
      if (next) {
        await install.mutateAsync({
          serverId: server.id,
          harnessId: harness.id,
        });
        toast.push({
          title: `${server.name} → ${harness.name}`,
          description: "Configuration written with a backup.",
          tone: "success",
        });
      } else {
        await uninstall.mutateAsync({
          serverId: server.id,
          harnessId: harness.id,
        });
        toast.push({
          title: `${server.name} removed`,
          description: `Deleted from ${harness.name}.`,
        });
      }
      await refresh();
    } catch (cause) {
      toast.push({
        title: next ? "Install failed" : "Uninstall failed",
        description: cause instanceof Error ? cause.message : String(cause),
        tone: "error",
      });
    } finally {
      setPendingCell(null);
    }
  }

  const detected = harnesses.filter((harness) => harness.detected).length;
  const configured = harnesses.reduce(
    (total, harness) => total + harness.serverCount,
    0,
  );

  return (
    <div>
      <PageHeader
        eyebrow="Sync"
        title="Harnesses"
        description="One matrix for every client on this machine. Flip a switch to write that server into the harness config — a backup is kept first."
        actions={
          <>
            <Button
              variant="secondary"
              onClick={runScanAll}
              loading={scanAll.isPending}
            >
              <RefreshCw className="h-3.5 w-3.5" /> Scan all
            </Button>
            <Button
              variant="primary"
              onClick={repairEverything}
              loading={repairAll.isPending}
              disabled={!totalDrift}
            >
              <Wrench className="h-3.5 w-3.5" /> Repair drift
            </Button>
          </>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          {
            label: "Detected",
            value: `${detected}/${harnesses.length}`,
          },
          { label: "Config servers", value: String(configured) },
          {
            label: "Managed",
            value: String(
              harnesses.reduce(
                (total, harness) => total + harness.managedCount,
                0,
              ),
            ),
          },
          { label: "Drift", value: String(totalDrift) },
        ].map((item) => (
          <div
            key={item.label}
            className="rounded-lg border border-border bg-card px-3 py-2.5"
          >
            <p className="text-xs text-muted-foreground">{item.label}</p>
            <p
              className={cn(
                "mt-1 text-lg font-semibold tabular-nums",
                item.label === "Drift" && totalDrift > 0 && "text-amber",
              )}
            >
              {isLoading ? "—" : item.value}
            </p>
          </div>
        ))}
      </div>

      <div className="mb-5 grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-5">
        {harnesses.map((harness) => {
          const item = driftByHarness.get(harness.id);
          const count =
            (item?.missingInConfig.length ?? 0) +
            (item?.missingInLibrary.length ?? 0) +
            (item?.drifted.length ?? 0);
          const busy = pendingHarness === harness.id;

          return (
            <div
              key={harness.id}
              className={cn(
                "rounded-xl border bg-card p-3 transition-colors",
                count ? "border-amber/30" : "border-border",
                !harness.detected && "opacity-60",
              )}
            >
              <div className="flex items-center gap-2">
                <HarnessDot id={harness.id} size={7} />
                <span className="truncate text-sm font-medium">
                  {harness.name}
                </span>
                {harness.detected ? (
                  <span className="ml-auto size-1.5 rounded-full bg-lime" />
                ) : (
                  <span className="ml-auto text-xs text-muted-foreground">
                    n/a
                  </span>
                )}
              </div>
              <p
                className="mt-1.5 truncate text-[11px] text-muted-foreground"
                title={harness.configPath}
              >
                {shortPath(harness.configPath)}
              </p>
              <div className="mt-2.5 flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  <span className="text-foreground">{harness.serverCount}</span>{" "}
                  in config
                </span>
                <span>
                  <span className="text-foreground">
                    {harness.managedCount}
                  </span>{" "}
                  managed
                </span>
              </div>
              <div className="mt-2.5 flex items-center justify-between">
                {harness.error ? (
                  <span
                    className="flex items-center gap-1 text-xs text-destructive"
                    title={harness.error}
                  >
                    <AlertTriangle className="size-3" /> parse error
                  </span>
                ) : count ? (
                  <span className="text-xs text-amber">{count} drift</span>
                ) : (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <CheckCircle2 className="size-3 text-lime" />
                    {timeAgo(harness.lastSyncedAt)}
                  </span>
                )}
                <div className="flex items-center gap-0.5">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => rescan(harness)}
                    disabled={busy || Boolean(harness.error)}
                    title="Rescan this harness"
                  >
                    <RefreshCw
                      className={cn("size-3", busy && "animate-spin")}
                    />
                  </Button>
                  {count ? (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => repairOne(harness)}
                      disabled={busy}
                      title="Repair drift"
                      className="text-amber"
                    >
                      <Wrench className="size-3" />
                    </Button>
                  ) : null}
                </div>
              </div>
              {harness.error ? (
                <p className="mt-1 line-clamp-2 text-xs leading-4 text-destructive">
                  {harness.error}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>

      {totalDrift > 0 ? (
        <section className="mb-5 overflow-hidden rounded-xl border border-amber/30 bg-amber/5">
          <div className="flex items-center gap-2 border-b border-amber/20 px-4 py-2.5">
            <AlertTriangle className="size-3.5 text-amber" />
            <h2 className="text-sm font-medium text-amber">Out of sync</h2>
            <span className="ml-auto text-xs text-amber/70">
              {totalDrift} item{totalDrift === 1 ? "" : "s"}
            </span>
          </div>
          <div className="divide-y divide-amber/10">
            {drift
              .filter(
                (item) =>
                  item.missingInConfig.length ||
                  item.missingInLibrary.length ||
                  item.drifted.length,
              )
              .map((item) => (
                <div
                  key={item.harnessId}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5"
                >
                  <HarnessDot id={item.harnessId} size={6} />
                  <span className="text-sm text-foreground">
                    {item.harnessName}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {[
                      item.missingInConfig.length
                        ? `${item.missingInConfig.length} missing from config`
                        : "",
                      item.drifted.length
                        ? `${item.drifted.length} changed`
                        : "",
                      item.missingInLibrary.length
                        ? `${item.missingInLibrary.length} unmanaged`
                        : "",
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                  <div className="ml-auto flex items-center gap-1">
                    <span
                      className="hidden max-w-[280px] truncate text-xs text-muted-foreground sm:block"
                      title={[
                        ...item.missingInConfig,
                        ...item.drifted,
                        ...item.missingInLibrary,
                      ].join(", ")}
                    >
                      {[...item.missingInConfig, ...item.drifted]
                        .slice(0, 3)
                        .join(", ")}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-amber hover:bg-amber/10"
                      onClick={() =>
                        repairOne(
                          harnesses.find(
                            (harness) => harness.id === item.harnessId,
                          )!,
                        )
                      }
                      disabled={pendingHarness === item.harnessId}
                    >
                      Fix
                    </Button>
                  </div>
                </div>
              ))}
          </div>
        </section>
      ) : null}

      <section className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex flex-col gap-2 border-b border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-medium">Install matrix</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              A green switch means the server is present in that harness config.
            </p>
          </div>
          <div className="relative w-full sm:w-56">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Filter servers…"
              className="h-8 pl-8 text-xs"
            />
          </div>
        </div>

        <Table
          className="border-collapse"
          style={{ minWidth: 260 + harnesses.length * 82 }}
        >
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent">
              <TableHead className="sticky left-0 z-20 w-[230px] bg-card px-4 py-2.5">
                <span className="text-xs font-medium text-muted-foreground">
                  Server
                </span>
              </TableHead>
              {harnesses.map((harness) => (
                <TableHead
                  key={harness.id}
                  className={cn(
                    "px-1 py-2.5 text-center",
                    !harness.detected && "opacity-40",
                  )}
                  title={`${harness.name} · ${harness.configPath}`}
                >
                  <div className="flex flex-col items-center gap-1">
                    <HarnessDot id={harness.id} size={6} />
                    <span className="max-w-[78px] truncate text-xs font-normal text-muted-foreground">
                      {harness.name}
                    </span>
                  </div>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredServers.map((server) => (
              <TableRow
                key={server.id}
                className="border-border/70 last:border-0"
              >
                <TableCell className="sticky left-0 z-10 bg-card px-4 py-1.5">
                  <button
                    onClick={() => setSelected(server.id)}
                    className="group flex w-full items-center gap-2 py-1 text-left"
                  >
                    <ServerGlyph
                      category={server.category}
                      name={server.name}
                      size="sm"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate text-sm text-foreground">
                          {server.name}
                        </span>
                        {server.missingRequired.length ? (
                          <AlertTriangle
                            className="size-3 shrink-0 text-amber"
                            aria-label="Needs setup"
                          />
                        ) : null}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {server.transport} · {server.category}
                      </span>
                    </span>
                    <ExternalLink className="size-3 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100" />
                  </button>
                </TableCell>
                {harnesses.map((harness) => {
                  const installed = server.installs.find(
                    (entry) => entry.harnessId === harness.id,
                  );
                  const key = `${server.id}:${harness.id}`;
                  const blocked =
                    (server.missingRequired.length > 0 && !installed) ||
                    Boolean(harness.error);
                  return (
                    <TableCell
                      key={harness.id}
                      className="px-1 py-1.5 text-center"
                    >
                      <div className="flex justify-center">
                        <Switch
                          size="sm"
                          checked={Boolean(installed)}
                          disabled={pendingCell === key || blocked}
                          onCheckedChange={(next) =>
                            toggleCell(server, harness, next)
                          }
                          label={`Toggle ${server.name} in ${harness.name}`}
                        />
                      </div>
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
            {!filteredServers.length ? (
              <TableRow>
                <TableCell
                  colSpan={harnesses.length + 1}
                  className="px-4 py-10 text-center text-sm text-muted-foreground"
                >
                  No servers match “{query}”.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </section>

      <p className="mt-4 flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
        <Badge tone="lime" mono>
          safe writes
        </Badge>
        Atomic replace · timestamped backup before every config change
      </p>

      <ServerDetailSheet
        serverId={selected}
        onClose={() => setSelected(null)}
      />
    </div>
  );
}
