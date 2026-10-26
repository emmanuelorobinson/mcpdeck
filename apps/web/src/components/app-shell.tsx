"use client";

import {
  Activity,
  Boxes,
  Compass,
  LayoutDashboard,
  Waypoints,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BrandMark } from "@/components/brand";
import { trpc } from "@/lib/trpc";
import { cn, timeAgo } from "@/lib/utils";

const NAV = [
  { href: "/", label: "Overview", icon: LayoutDashboard, key: "overview" },
  { href: "/servers", label: "Servers", icon: Boxes, key: "servers" },
  { href: "/harnesses", label: "Harnesses", icon: Waypoints, key: "harnesses" },
  { href: "/discover", label: "Discover", icon: Compass, key: "discover" },
  { href: "/activity", label: "Activity", icon: Activity, key: "activity" },
] as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { data: overview, isError } = trpc.system.overview.useQuery(undefined, {
    retry: false,
    refetchInterval: 30_000,
  });

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  const counts: Record<string, number | undefined> = {
    servers: overview?.serverCount,
    harnesses: overview?.driftCount || undefined,
  };

  return (
    <div className="min-h-screen bg-background">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[232px] flex-col border-r border-border bg-sidebar lg:flex">
        <div className="px-5 pb-5 pt-6">
          <Link href="/" aria-label="MCP Deck home">
            <BrandMark />
          </Link>
        </div>

        <div className="px-5">
          <p className="label-mono mb-2 px-0.5">Workspace</p>
        </div>

        <nav className="flex flex-col gap-0.5 px-3">
          {NAV.map((item) => {
            const active = isActive(item.href);
            const count = counts[item.key];
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "group flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors",
                  active
                    ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                    : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground",
                )}
              >
                <item.icon
                  className={cn(
                    "size-4",
                    active ? "text-foreground" : "text-muted-foreground",
                  )}
                  strokeWidth={1.8}
                />
                <span>{item.label}</span>
                {count ? (
                  <span
                    className={cn(
                      "ml-auto rounded-md px-1.5 py-0.5 text-[10px] font-medium tabular-nums",
                      item.key === "harnesses" && overview?.driftCount
                        ? "bg-destructive/15 text-destructive"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    {count}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </nav>

        <div className="flex-1" />

        <div className="border-t border-border p-3">
          <div className="flex items-center gap-2 px-2 py-1.5">
            <span
              className={cn(
                "size-1.5 rounded-full",
                isError
                  ? "bg-rose"
                  : overview
                    ? "animate-pulse-dot bg-lime"
                    : "bg-amber",
              )}
            />
            <span className="text-xs font-medium text-foreground">
              {isError ? "API offline" : overview ? "Local API" : "Connecting"}
            </span>
            <span className="ml-auto text-[10px] text-muted-foreground">
              v0.1
            </span>
          </div>
          <div className="mt-1 flex items-center justify-between px-2 text-[10px] text-muted-foreground">
            <span>
              {overview
                ? `${overview.detectedHarnessCount}/${overview.harnessCount} harnesses`
                : "—"}
            </span>
            <span>{overview ? timeAgo(overview.lastSyncAt) : "—"}</span>
          </div>
        </div>
      </aside>

      <div className="lg:pl-[232px]">
        <div className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur-xl lg:hidden">
          <div className="flex h-14 items-center justify-between px-4">
            <Link href="/">
              <BrandMark />
            </Link>
            <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <span
                className={cn(
                  "size-1.5 rounded-full",
                  isError ? "bg-rose" : "bg-lime",
                )}
              />
              {isError ? "offline" : "local"}
            </span>
          </div>
          <nav className="flex justify-between gap-0.5 overflow-x-auto px-3 pb-2">
            {NAV.map((item) => {
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1.5 text-[11px] transition-colors",
                    active
                      ? "bg-muted font-medium text-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <item.icon className="hidden size-3.5 sm:block" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <main className="mx-auto w-full max-w-[1400px] px-4 pb-20 pt-7 sm:px-6 lg:px-8 lg:pt-10">
          {children}
        </main>
      </div>
    </div>
  );
}
