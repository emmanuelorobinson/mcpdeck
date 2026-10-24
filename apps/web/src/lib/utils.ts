export { cn } from "cn";

export function timeAgo(timestamp: number | null | undefined): string {
  if (!timestamp) return "never";
  const diff = Date.now() - timestamp;
  if (diff < 45_000) return "just now";
  const minutes = Math.round(diff / 60_000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export function formatDateTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function shortPath(path: string): string {
  const home = path.match(/^\/(?:Users|home)\/[^/]+/);
  if (home) return path.replace(home[0], "~");
  return path;
}

export function truncateMiddle(value: string, max = 42): string {
  if (value.length <= max) return value;
  const half = Math.floor((max - 1) / 2);
  return `${value.slice(0, half)}…${value.slice(-half)}`;
}
