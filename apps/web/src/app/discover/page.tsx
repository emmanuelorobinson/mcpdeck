"use client";

import {
  ArrowUpRight,
  Check,
  Compass,
  Download,
  Search,
  ShieldCheck,
} from "lucide-react";
import { useMemo, useState } from "react";
import { PageHeader, EmptyState } from "@/components/brand";
import { ServerDetailSheet } from "@/components/server-detail-sheet";
import { ServerGlyph } from "@/components/server-glyph";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { trpc } from "@/lib/trpc";
import { useRefresh } from "@/lib/use-refresh";
import { cn } from "@/lib/utils";

export default function DiscoverPage() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [pending, setPending] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const toast = useToast();
  const refresh = useRefresh();

  const { data: registry = [], isLoading } = trpc.registry.list.useQuery();
  const { data: servers = [] } = trpc.servers.list.useQuery();
  const importServer = trpc.registry.import.useMutation();

  const bySlug = useMemo(
    () => new Map(servers.map((server) => [server.slug, server])),
    [servers],
  );

  const categories = useMemo(
    () => ["All", ...[...new Set(registry.map((item) => item.category))].sort()],
    [registry],
  );

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return registry.filter((item) => {
      if (category !== "All" && item.category !== category) return false;
      if (!term) return true;
      return [item.name, item.description, item.category, ...item.tags]
        .join(" ")
        .toLowerCase()
        .includes(term);
    });
  }, [registry, query, category]);

  async function add(registryId: string) {
    setPending(registryId);
    try {
      const created = await importServer.mutateAsync({ registryId });
      await refresh();
      toast.push({
        title: `${created.name} added to the library`,
        description: created.missingRequired.length
          ? `Add ${created.missingRequired.join(", ")} to finish setup.`
          : "Ready to install into any harness.",
        tone: "success",
      });
      setSelected(created.id);
    } catch (cause) {
      toast.push({
        title: "Could not add server",
        description: cause instanceof Error ? cause.message : String(cause),
        tone: "error",
      });
    } finally {
      setPending(null);
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="Catalog"
        title="Discover"
        description="A curated starting point. Add one to your library, then install it into any harness with a single flip."
        actions={
          <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-1.5">
            <Compass className="size-3.5 text-lime" />
            <span className="text-xs text-muted-foreground">
              {registry.length} curated
            </span>
          </div>
        }
      />

      <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search the catalog…"
            className="pl-9"
          />
        </div>
        <div className="flex gap-1 overflow-x-auto pb-1 sm:pb-0">
          {categories.map((item) => (
            <button
              key={item}
              onClick={() => setCategory(item)}
              className={cn(
                "shrink-0 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors",
                category === item
                  ? "border-border bg-secondary text-secondary-foreground"
                  : "border-transparent text-muted-foreground hover:bg-muted/50 hover:text-foreground",
              )}
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 9 }).map((_, index) => (
            <div
              key={index}
              className="skeleton h-[220px] rounded-xl border border-border"
            />
          ))}
        </div>
      ) : filtered.length ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((item) => {
            const existing = bySlug.get(item.slug);
            const hosted = item.transport === "http";
            return (
              <div
                key={item.id}
                className="group flex flex-col rounded-xl border border-border bg-card p-4 transition-colors hover:bg-muted/30"
              >
                <div className="flex items-start gap-2.5">
                  <ServerGlyph category={item.category} name={item.name} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <h3 className="truncate text-sm font-medium text-foreground">
                        {item.name}
                      </h3>
                      {item.verified ? (
                        <ShieldCheck
                          className="size-3 shrink-0 text-cyan"
                          aria-label="Verified"
                        />
                      ) : null}
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {item.category} / {item.transport}
                    </p>
                  </div>
                  <Badge tone={hosted ? "cyan" : "lime"} mono>
                    {hosted ? "hosted" : "local"}
                  </Badge>
                </div>

                <p className="mt-3 line-clamp-3 min-h-[60px] text-sm leading-5 text-muted-foreground">
                  {item.description}
                </p>

                <div className="mt-3 flex items-center gap-1.5 overflow-hidden rounded-md border border-border bg-muted/40 px-2 py-1.5">
                  <span className="shrink-0 font-mono text-xs text-lime">
                    {hosted ? "→" : "$"}
                  </span>
                  <span className="truncate font-mono text-xs text-muted-foreground">
                    {hosted
                      ? item.url
                      : [item.command, ...(item.args ?? [])].join(" ")}
                  </span>
                </div>

                <div className="mt-2.5 flex flex-wrap items-center gap-1">
                  {item.tags.slice(0, 3).map((tag) => (
                    <Badge key={tag} variant="secondary" mono>
                      {tag}
                    </Badge>
                  ))}
                  {item.envKeys?.length || item.headerKeys?.length ? (
                    <span className="ml-auto text-xs text-muted-foreground">
                      {item.envKeys?.length ?? 0} env ·{" "}
                      {item.headerKeys?.length ?? 0} header
                    </span>
                  ) : null}
                </div>

                <div className="mt-auto flex items-center justify-between gap-2 pt-4">
                  {item.homepage ? (
                    <a
                      href={item.homepage}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
                    >
                      docs <ArrowUpRight className="size-3" />
                    </a>
                  ) : (
                    <span />
                  )}
                  {existing ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-lime"
                      onClick={() => setSelected(existing.id)}
                    >
                      <Check className="size-3.5" /> In library
                    </Button>
                  ) : (
                    <Button
                      variant="secondary"
                      size="sm"
                      loading={pending === item.id}
                      onClick={() => add(item.id)}
                    >
                      <Download className="size-3.5" /> Add to library
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <EmptyState
          icon={<Search className="h-4 w-4" />}
          title="Nothing in the catalog matches"
          description="Try another category, or clear the search."
          action={
            <Button
              variant="secondary"
              onClick={() => {
                setQuery("");
                setCategory("All");
              }}
            >
              Reset
            </Button>
          }
        />
      )}

      <p className="mt-6 text-center text-xs text-muted-foreground">
        Templates only prefill configuration — nothing is installed until you
        flip a switch in a server's install matrix.
      </p>

      <ServerDetailSheet
        serverId={selected}
        onClose={() => setSelected(null)}
      />
    </div>
  );
}
