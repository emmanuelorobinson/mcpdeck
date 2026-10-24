"use client";

import { CATEGORIES, configPreview, type ServerDTO, type Transport } from "@mcpdeck/shared";
import {
  AlertTriangle,
  ArrowUpRight,
  Boxes,
  Plus,
  Search,
  Star,
} from "lucide-react";
import { motion } from "framer-motion";
import { useMemo, useState } from "react";
import { AddServerSheet } from "@/components/add-server-sheet";
import { HarnessDots } from "@/components/harness";
import { PageHeader, EmptyState } from "@/components/brand";
import { ServerDetailSheet } from "@/components/server-detail-sheet";
import { ServerGlyph } from "@/components/server-glyph";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";

type InstallFilter = "all" | "installed" | "setup";

export default function ServersPage() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [transport, setTransport] = useState<"all" | Transport>("all");
  const [installFilter, setInstallFilter] = useState<InstallFilter>("all");
  const [favorites, setFavorites] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const { data: servers = [], isLoading } = trpc.servers.list.useQuery();

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return servers.filter((server) => {
      if (category !== "All" && server.category !== category) return false;
      if (transport !== "all" && server.transport !== transport) return false;
      if (favorites && !server.isFavorite) return false;
      if (installFilter === "installed" && server.installs.length === 0)
        return false;
      if (installFilter === "setup" && server.missingRequired.length === 0)
        return false;
      if (!term) return true;
      const haystack = [
        server.name,
        server.slug,
        server.description,
        server.command,
        server.url,
        server.category,
        ...server.tags,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(term);
    }).sort((a, b) => {
      if (a.isFavorite !== b.isFavorite) return a.isFavorite ? -1 : 1;
      if (a.installs.length !== b.installs.length) {
        return b.installs.length - a.installs.length;
      }
      return a.name.localeCompare(b.name);
    });
  }, [servers, query, category, transport, favorites, installFilter]);

  const activeFilters =
    (category !== "All" ? 1 : 0) +
    (transport !== "all" ? 1 : 0) +
    (favorites ? 1 : 0) +
    (installFilter !== "all" ? 1 : 0) +
    (query ? 1 : 0);

  return (
    <div>
      <PageHeader
        eyebrow="Library"
        title="Servers"
        description="Every MCP you use, stored once with encrypted credentials. Install any of them into any detected harness."
        actions={
          <Button variant="primary" onClick={() => setAdding(true)}>
            <Plus className="h-3.5 w-3.5" /> Add server
          </Button>
        }
      />

      <div className="mb-5 space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search name, command, tag…"
              className="pl-9"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="h-9 min-w-[150px]" aria-label="Filter by category">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="All">All categories</SelectItem>
                {CATEGORIES.map((item) => (
                  <SelectItem key={item} value={item}>
                    {item}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="inline-flex rounded-lg border border-border bg-muted/40 p-0.5">
              {(["all", "stdio", "http"] as const).map((item) => (
                <button
                  key={item}
                  onClick={() => setTransport(item)}
                  className={cn(
                    "rounded-md px-2.5 py-1.5 text-xs font-medium capitalize transition-colors",
                    transport === item
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {item === "all" ? "All" : item}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <FilterChip
            active={favorites}
            onClick={() => setFavorites((value) => !value)}
            icon={<Star className="h-3 w-3" />}
          >
            Favorites
          </FilterChip>
          <FilterChip
            active={installFilter === "installed"}
            onClick={() =>
              setInstallFilter((value) =>
                value === "installed" ? "all" : "installed",
              )
            }
          >
            Installed
          </FilterChip>
          <FilterChip
            active={installFilter === "setup"}
            onClick={() =>
              setInstallFilter((value) => (value === "setup" ? "all" : "setup"))
            }
            icon={<AlertTriangle className="h-3 w-3" />}
            tone="amber"
          >
            Needs setup
          </FilterChip>
          {activeFilters > 1 ? (
            <button
              onClick={() => {
                setQuery("");
                setCategory("All");
                setTransport("all");
                setFavorites(false);
                setInstallFilter("all");
              }}
              className="ml-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              Clear filters
            </button>
          ) : null}
          <span className="ml-auto text-xs tabular-nums text-muted-foreground">
            {filtered.length} of {servers.length}
          </span>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div
              key={index}
              className="skeleton h-[200px] rounded-xl border border-border"
            />
          ))}
        </div>
      ) : filtered.length ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((server, index) => (
            <motion.div
              key={server.id}
              layout
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: 0.25,
                delay: Math.min(index * 0.015, 0.2),
                ease: [0.22, 1, 0.36, 1],
              }}
            >
              <ServerCard
                server={server}
                onOpen={() => setSelected(server.id)}
              />
            </motion.div>
          ))}
        </div>
      ) : servers.length ? (
        <EmptyState
          icon={<Search className="h-4 w-4" />}
          title="No servers match"
          description="Try a different search or clear the filters."
          action={
            <Button
              variant="secondary"
              onClick={() => {
                setQuery("");
                setCategory("All");
                setTransport("all");
                setFavorites(false);
                setInstallFilter("all");
              }}
            >
              Clear filters
            </Button>
          }
        />
      ) : (
        <EmptyState
          icon={<Boxes className="h-4 w-4" />}
          title="Your library is empty"
          description="Add a server manually or import a curated template. Existing harness configs are discovered automatically on first run."
          action={
            <Button variant="primary" onClick={() => setAdding(true)}>
              <Plus className="h-3.5 w-3.5" /> Add your first server
            </Button>
          }
        />
      )}

      <AddServerSheet
        open={adding}
        onClose={() => setAdding(false)}
        onCreated={(id) => setSelected(id)}
      />
      <ServerDetailSheet
        serverId={selected}
        onClose={() => setSelected(null)}
      />
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  icon,
  children,
  tone = "lime",
}: {
  active: boolean;
  onClick: () => void;
  icon?: React.ReactNode;
  children: React.ReactNode;
  tone?: "lime" | "amber";
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
        active
          ? tone === "amber"
            ? "border-amber/30 bg-amber/10 text-amber"
            : "border-border bg-secondary text-secondary-foreground"
          : "border-border bg-transparent text-muted-foreground hover:bg-muted/50 hover:text-foreground",
      )}
    >
      {icon}
      {children}
    </button>
  );
}

function ServerCard({
  server,
  onOpen,
}: {
  server: ServerDTO;
  onOpen: () => void;
}) {
  const preview = configPreview({
    transport: server.transport,
    command: server.command ?? undefined,
    args: server.args,
    url: server.url ?? undefined,
  });

  return (
    <button
      onClick={onOpen}
      className="group flex h-full w-full flex-col rounded-xl border border-border bg-card p-4 text-left transition-colors hover:bg-muted/30 hover:shadow-sm"
    >
      <div className="flex items-start gap-2.5">
        <ServerGlyph category={server.category} name={server.name} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <h3 className="truncate text-sm font-medium text-foreground">
              {server.name}
            </h3>
            {server.isFavorite ? (
              <Star className="size-3 shrink-0 fill-lime text-lime" />
            ) : null}
          </div>
          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
            {server.category}
            <span className="text-muted-foreground/50">/</span>
            {server.transport}
            {server.source === "imported" ? (
              <>
                <span className="text-muted-foreground/50">/</span>
                <span className="text-violet">imported</span>
              </>
            ) : null}
          </p>
        </div>
        <ArrowUpRight className="mt-0.5 size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
      </div>

      <p className="mt-3 line-clamp-2 min-h-[40px] text-sm leading-5 text-muted-foreground">
        {server.description || "No description yet."}
      </p>

      <div className="mt-3 flex items-center gap-1.5 overflow-hidden rounded-md border border-border bg-muted/40 px-2 py-1.5">
        <span className="shrink-0 font-mono text-xs text-lime">
          {server.transport === "stdio" ? "$" : "→"}
        </span>
        <span className="truncate font-mono text-xs text-muted-foreground">
          {preview || "—"}
        </span>
      </div>

      <div className="mt-auto flex items-center justify-between gap-2 pt-3.5">
        <HarnessDots
          ids={server.installs.map((install) => install.harnessId)}
          max={5}
          size={6}
        />
        <div className="flex items-center gap-1.5">
          {server.missingRequired.length ? (
            <Badge tone="amber" mono>
              setup
            </Badge>
          ) : null}
          <span className="text-xs text-muted-foreground">
            {server.installs.length
              ? `${server.installs.length} install${
                  server.installs.length === 1 ? "" : "s"
                }`
              : "not installed"}
          </span>
        </div>
      </div>
    </button>
  );
}
