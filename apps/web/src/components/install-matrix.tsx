"use client";

import type { HarnessDTO, ServerDTO } from "@mcpdeck/shared";
import { AlertTriangle, Settings2 } from "lucide-react";
import { useState } from "react";
import { HarnessDot } from "@/components/harness";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast";
import { trpc } from "@/lib/trpc";
import { useRefresh } from "@/lib/use-refresh";
import { cn, shortPath } from "@/lib/utils";

export function InstallMatrix({
  server,
  harnesses,
  onNeedsSetup,
}: {
  server: ServerDTO;
  harnesses: HarnessDTO[];
  onNeedsSetup?: () => void;
}) {
  const utils = trpc.useUtils();
  const refresh = useRefresh();
  const toast = useToast();
  const [pending, setPending] = useState<string | null>(null);

  const install = trpc.servers.install.useMutation();
  const uninstall = trpc.servers.uninstall.useMutation();

  const installs = new Map(
    server.installs.map((entry) => [entry.harnessId, entry]),
  );

  async function toggle(harness: HarnessDTO, next: boolean) {
    setPending(harness.id);
    try {
      if (next) {
        await install.mutateAsync({
          serverId: server.id,
          harnessId: harness.id,
        });
        toast.push({
          title: `Installed in ${harness.name}`,
          description: `Wrote ${server.slug} to ${shortPath(harness.configPath)}`,
          tone: "success",
        });
      } else {
        await uninstall.mutateAsync({
          serverId: server.id,
          harnessId: harness.id,
        });
        toast.push({
          title: `Removed from ${harness.name}`,
          description: "A backup of the previous config was kept.",
        });
      }
      await refresh();
      await utils.servers.get.invalidate({ id: server.id });
    } catch (error) {
      toast.push({
        title: next ? "Could not install" : "Could not uninstall",
        description: error instanceof Error ? error.message : String(error),
        tone: "error",
      });
    } finally {
      setPending(null);
    }
  }

  return (
    <div>
      {server.missingRequired.length ? (
        <button
          type="button"
          onClick={onNeedsSetup}
          className="mb-3 flex w-full items-start gap-2 rounded-lg border border-amber/30 bg-amber/10 px-3 py-2.5 text-left transition-colors hover:bg-amber/15"
        >
          <Settings2 className="mt-0.5 size-3.5 shrink-0 text-amber" />
          <span className="text-sm leading-5 text-amber">
            Missing required values: {server.missingRequired.join(", ")}. Set
            them up before installing.
          </span>
        </button>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-3.5 py-2.5">
          <span className="text-xs font-medium text-foreground">
            Install matrix
          </span>
          <span className="text-xs text-muted-foreground">
            {server.installs.length} active
          </span>
        </div>
        <div className="divide-y divide-border">
          {harnesses.map((harness) => {
            const entry = installs.get(harness.id);
            const isPending = pending === harness.id;
            const broken = Boolean(harness.error);
            return (
              <div
                key={harness.id}
                className={cn(
                  "flex items-center gap-3 px-3.5 py-2.5",
                  !harness.detected && "opacity-70",
                  broken && "opacity-60",
                )}
              >
                <HarnessDot id={harness.id} size={7} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground">
                      {harness.name}
                    </span>
                    {!harness.detected ? (
                      <span className="text-xs text-muted-foreground">
                        not detected
                      </span>
                    ) : null}
                    {broken ? (
                      <AlertTriangle
                        className="size-3 text-destructive"
                        aria-label={harness.error ?? "Config error"}
                      />
                    ) : null}
                  </div>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {entry ? (
                      <span className="text-muted-foreground">{entry.configKey}</span>
                    ) : null}
                    {entry ? " · " : ""}
                    {shortPath(harness.configPath)}
                  </p>
                </div>
                {entry ? (
                  <Badge tone="lime" mono className="hidden sm:inline-flex">
                    on
                  </Badge>
                ) : null}
                <Switch
                  size="sm"
                  checked={Boolean(entry)}
                  disabled={isPending || broken}
                  onCheckedChange={(next) => toggle(harness, next)}
                  label={`${entry ? "Uninstall" : "Install"} ${server.name} in ${harness.name}`}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
