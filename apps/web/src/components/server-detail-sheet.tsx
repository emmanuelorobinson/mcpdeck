"use client";

import type { ServerDTO } from "@mcpdeck/shared";
import {
  Check,
  Copy,
  Eye,
  EyeOff,
  GitFork,
  Globe,
  Pencil,
  Star,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { HarnessDots } from "@/components/harness";
import { InstallMatrix } from "@/components/install-matrix";
import { ServerGlyph } from "@/components/server-glyph";
import {
  payloadFromForm,
  ServerFormFields,
  toFormState,
  type ServerFormState,
} from "@/components/server-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Modal, Sheet } from "@/components/ui/sheet-layout";
import { useToast } from "@/components/ui/toast";
import { trpc } from "@/lib/trpc";
import { useRefresh } from "@/lib/use-refresh";
import { cn, timeAgo, truncateMiddle } from "@/lib/utils";

function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-7">
      <div className="mb-2.5 flex items-center justify-between">
        <h3 className="text-xs font-semibold text-foreground">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

export function ServerDetailSheet({
  serverId,
  onClose,
  onDeleted,
}: {
  serverId: string | null;
  onClose: () => void;
  onDeleted?: () => void;
}) {
  const utils = trpc.useUtils();
  const refresh = useRefresh();
  const toast = useToast();

  const { data: server, isLoading } = trpc.servers.get.useQuery(
    { id: serverId ?? "" },
    { enabled: Boolean(serverId) },
  );
  const { data: harnesses = [] } = trpc.harnesses.list.useQuery();

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<ServerFormState | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [removeFromHarnesses, setRemoveFromHarnesses] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setEditing(false);
    setForm(null);
    setRevealed(false);
    setConfirmDelete(false);
    setCopied(false);
  }, [serverId]);

  const { data: secrets } = trpc.servers.reveal.useQuery(
    { id: serverId ?? "" },
    { enabled: Boolean(serverId) && revealed },
  );

  const update = trpc.servers.update.useMutation();
  const favorite = trpc.servers.favorite.useMutation();
  const push = trpc.servers.push.useMutation();
  const remove = trpc.servers.delete.useMutation();

  const config = useMemo(() => {
    if (!server) return "";
    const env = Object.fromEntries(
      server.envKeys.map((key) => [
        key,
        revealed ? (secrets?.env[key] ?? "") : "••••••••",
      ]),
    );
    const headers = Object.fromEntries(
      server.headerKeys.map((key) => [
        key,
        revealed ? (secrets?.headers[key] ?? "") : "••••••••",
      ]),
    );
    const base =
      server.transport === "stdio"
        ? { command: server.command, args: server.args }
        : { url: server.url };
    return JSON.stringify(
      {
        ...base,
        ...(server.envKeys.length ? { env } : {}),
        ...(server.headerKeys.length ? { headers } : {}),
      },
      null,
      2,
    );
  }, [server, revealed, secrets]);

  function beginEdit() {
    if (!server) return;
    setForm(toFormState(server));
    setEditing(true);
    setRevealed(false);
  }

  function updateForm(updater: (current: ServerFormState) => ServerFormState) {
    setForm((current) => (current ? updater(current) : current));
  }

  async function save() {
    if (!server || !form) return;
    try {
      const payload = payloadFromForm(form, server);
      const updated = await update.mutateAsync({ id: server.id, ...payload });
      let pushed = 0;
      if (updated.installs.length && updated.missingRequired.length === 0) {
        const result = await push.mutateAsync({ id: server.id });
        pushed = result.pushed;
      }
      await refresh();
      await utils.servers.get.invalidate({ id: server.id });
      setEditing(false);
      setForm(null);
      toast.push({
        title: "Configuration saved",
        description:
          pushed > 0
            ? `Pushed to ${pushed} harness${pushed === 1 ? "" : "es"}.`
            : updated.missingRequired.length
              ? `Add ${updated.missingRequired.join(", ")} to install it.`
              : "The library entry is up to date.",
        tone: "success",
      });
    } catch (cause) {
      toast.push({
        title: "Could not save",
        description: cause instanceof Error ? cause.message : String(cause),
        tone: "error",
      });
    }
  }

  async function toggleFavorite() {
    if (!server) return;
    try {
      await favorite.mutateAsync({ id: server.id, value: !server.isFavorite });
      await refresh();
      await utils.servers.get.invalidate({ id: server.id });
    } catch (cause) {
      toast.push({
        title: "Could not update favorite",
        description: cause instanceof Error ? cause.message : String(cause),
        tone: "error",
      });
    }
  }

  async function handlePush() {
    if (!server) return;
    try {
      const result = await push.mutateAsync({ id: server.id });
      await refresh();
      toast.push({
        title: "Config pushed",
        description: `${server.name} synced to ${result.pushed} harness${
          result.pushed === 1 ? "" : "es"
        }.`,
        tone: "success",
      });
    } catch (cause) {
      toast.push({
        title: "Push failed",
        description: cause instanceof Error ? cause.message : String(cause),
        tone: "error",
      });
    }
  }

  async function handleDelete() {
    if (!server) return;
    try {
      await remove.mutateAsync({
        id: server.id,
        removeFromHarnesses,
      });
      await refresh();
      setConfirmDelete(false);
      onClose();
      onDeleted?.();
      toast.push({
        title: `${server.name} deleted`,
        description: removeFromHarnesses
          ? "Removed from the library and its harness configs."
          : "Removed from the library. Harness configs were left untouched.",
      });
    } catch (cause) {
      toast.push({
        title: "Could not delete",
        description: cause instanceof Error ? cause.message : String(cause),
        tone: "error",
      });
    }
  }

  async function copyConfig() {
    try {
      await navigator.clipboard.writeText(config);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.push({ title: "Clipboard unavailable", tone: "error" });
    }
  }

  const editDirty = Boolean(editing && form);

  return (    <>
      <Sheet
        open={Boolean(serverId)}
        onClose={() => {
          if (editing) {
            setEditing(false);
            setForm(null);
            return;
          }
          onClose();
        }}
        eyebrow={
          server ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge tone={server.transport === "stdio" ? "lime" : "cyan"} mono>
                {server.transport}
              </Badge>
              <Badge>{server.category}</Badge>
              {server.source !== "manual" ? (
                <Badge tone="violet">{server.source}</Badge>
              ) : null}
              {server.missingRequired.length ? (
                <Badge tone="amber">needs setup</Badge>
              ) : null}
            </div>
          ) : null
        }
        title={
          server ? (
            <span className="flex items-center gap-2.5">
              <ServerGlyph
                category={server.category}
                name={server.name}
                size="sm"
              />
              {server.name}
              {server.isFavorite ? (
                <Star className="h-3.5 w-3.5 fill-lime text-lime" />
              ) : null}
            </span>
          ) : (
            "Server"
          )
        }
        subtitle={
          server ? (
            <span>
              {server.description || "No description yet."}
              {server.installs.length ? (
                <span className="mt-2 flex items-center gap-2">
                  <HarnessDots
                    ids={server.installs.map((install) => install.harnessId)}
                  />
                  <span className="text-xs text-muted-foreground">
                    {server.installs.length} installation
                    {server.installs.length === 1 ? "" : "s"}
                  </span>
                </span>
              ) : null}
            </span>
          ) : null
        }
        actions={
          server && !editing ? (
            <>
              <Button
                variant="ghost"
                size="icon"
                onClick={toggleFavorite}
                aria-label="Toggle favorite"
              >
                <Star
                  className={cn(
                    "h-3.5 w-3.5",
                    server.isFavorite ? "fill-lime text-lime" : "",
                  )}
                />
              </Button>
              <Button variant="secondary" size="sm" onClick={beginEdit}>
                <Pencil className="h-3 w-3" /> Edit
              </Button>
            </>
          ) : null
        }
        footer={
          editing ? (
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-muted-foreground">
                Changes update the library first, then your installed harnesses.
              </span>
              <div className="flex shrink-0 items-center gap-2">
                <Button
                  variant="ghost"
                  onClick={() => {
                    setEditing(false);
                    setForm(null);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  loading={update.isPending || push.isPending}
                  onClick={save}
                >
                  Save changes
                </Button>
              </div>
            </div>
          ) : server ? (
            <div className="flex items-center justify-between gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="text-rose/80 hover:bg-rose/10 hover:text-rose"
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </Button>
              <div className="flex items-center gap-2">
                {server.installs.length ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handlePush}
                    loading={push.isPending}
                  >
                    Push to {server.installs.length}
                  </Button>
                ) : null}
                <Button variant="primary" size="sm" onClick={beginEdit}>
                  <Pencil className="h-3 w-3" /> Edit config
                </Button>
              </div>
            </div>
          ) : null
        }
      >
        {isLoading || !server ? (
          <div className="space-y-4">
            <div className="skeleton h-32 w-full rounded-xl" />
            <div className="skeleton h-40 w-full rounded-xl" />
            <div className="skeleton h-20 w-full rounded-xl" />
          </div>
        ) : editing && form ? (
          <ServerFormFields
            form={form}
            setForm={updateForm}
            requiredEnv={server.requiredEnv}
            requiredHeaders={server.requiredHeaders}
          />
        ) : (
          <>
            <div className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span>
                key: <span className="text-foreground">{server.slug}</span>
              </span>
              <span>·</span>
              <span>updated {timeAgo(server.updatedAt)}</span>
              <span>·</span>
              <span>created {timeAgo(server.createdAt)}</span>
            </div>

            <Section title="Installations">
              <InstallMatrix
                server={server}
                harnesses={harnesses}
                onNeedsSetup={beginEdit}
              />
            </Section>

            <Section
              title="Normalized config"
              action={
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setRevealed((value) => !value)}
                  >
                    {revealed ? (
                      <EyeOff className="h-3 w-3" />
                    ) : (
                      <Eye className="h-3 w-3" />
                    )}
                    {revealed ? "Hide" : "Reveal"}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={copyConfig}>
                    {copied ? (
                      <Check className="h-3 w-3 text-lime" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                    {copied ? "Copied" : "Copy"}
                  </Button>
                </div>
              }
            >
              <div className="relative overflow-hidden rounded-lg border border-border bg-background">
                <div className="flex items-center gap-2 border-b border-border px-3 py-2">
                  <span className="text-xs font-medium text-muted-foreground">
                    mcp.json
                  </span>
                  {revealed ? (
                    <span className="ml-auto text-xs text-amber">
                      secrets visible
                    </span>
                  ) : null}
                </div>
                <pre className="max-h-[240px] overflow-auto px-3.5 py-3 font-mono text-xs leading-relaxed text-foreground/90">
                  {config}
                </pre>
              </div>
            </Section>

            <Section title="Details">
              <div className="grid grid-cols-1 gap-x-6 gap-y-3 rounded-lg border border-border bg-muted/20 p-4 sm:grid-cols-2">
                <DetailRow label="Source" value={server.source} mono />
                <DetailRow
                  label="Transport"
                  value={server.transport}
                  mono
                />
                <DetailRow
                  label="Environment"
                  value={
                    server.envKeys.length
                      ? server.envKeys.join(", ")
                      : "none"
                  }
                  mono
                />
                <DetailRow
                  label="Headers"
                  value={
                    server.headerKeys.length
                      ? server.headerKeys.join(", ")
                      : "none"
                  }
                  mono
                />
                {server.homepage ? (
                  <div>
                    <p className="text-xs text-muted-foreground">Homepage</p>
                    <a
                      href={server.homepage}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 flex items-center gap-1 text-sm text-cyan hover:underline"
                    >
                      <Globe className="size-3.5" />
                      {truncateMiddle(
                        server.homepage.replace(/^https?:\/\//, ""),
                        34,
                      )}
                    </a>
                  </div>
                ) : null}
                {server.repository ? (
                  <div>
                    <p className="text-xs text-muted-foreground">Repository</p>
                    <a
                      href={server.repository}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 flex items-center gap-1 text-sm text-cyan hover:underline"
                    >
                      <GitFork className="size-3.5" />
                      {truncateMiddle(
                        server.repository.replace(/^https?:\/\//, ""),
                        34,
                      )}
                    </a>
                  </div>
                ) : null}
                {server.tags.length ? (
                  <div className="sm:col-span-2">
                    <p className="text-xs text-muted-foreground">Tags</p>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {server.tags.map((tag) => (
                        <Badge key={tag} mono>
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </Section>

            <p className="text-xs leading-5 text-muted-foreground">
              Need this in another harness? Use the matrix above. Every write
              keeps a timestamped backup of the previous config.
            </p>
          </>
        )}
      </Sheet>

      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete this server?"
        description={`${
          server?.name ?? "This server"
        } will be removed from your library. This cannot be undone.`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={remove.isPending}
              onClick={handleDelete}
            >
              <Trash2 className="h-3.5 w-3.5" /> Delete server
            </Button>
          </>
        }
      >
        <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-border bg-muted/30 p-3">
          <Checkbox
            checked={removeFromHarnesses}
            onCheckedChange={(checked) =>
              setRemoveFromHarnesses(checked === true)
            }
            className="mt-0.5"
          />
          <span>
            <span className="block text-sm text-foreground">
              Also remove it from{" "}
              {server?.installs.length ?? 0} harness config
              {(server?.installs.length ?? 0) === 1 ? "" : "s"}
            </span>
            <span className="mt-0.5 block text-xs text-muted-foreground">
              Recommended. Backups are still written before the change.
            </span>
          </span>
        </label>
      </Modal>
    </>
  );
}

function DetailRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-1 break-all text-sm text-foreground",
          mono && "font-mono text-xs",
        )}
      >
        {value}
      </p>
    </div>
  );
}
