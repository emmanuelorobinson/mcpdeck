"use client";

import { useCallback } from "react";
import { trpc } from "@/lib/trpc";

export function useRefresh() {
  const utils = trpc.useUtils();

  return useCallback(async () => {
    await Promise.all([
      utils.system.overview.invalidate(),
      utils.servers.list.invalidate(),
      utils.servers.get.invalidate(),
      utils.harnesses.list.invalidate(),
      utils.harnesses.driftAll.invalidate(),
      utils.activity.list.invalidate(),
    ]);
  }, [utils]);
}
