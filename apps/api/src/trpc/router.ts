import { initTRPC } from "@trpc/server";
import { z } from "zod";
import { HARNESSES, REGISTRY } from "@mcpdeck/shared";
import {
  createServerInput,
  deleteServerInput,
  eventsInput,
  harnessIdInput,
  importRegistryInput,
  installInput,
  installManyInput,
  listServersInput,
  uninstallInput,
  updateServerInput,
} from "../lib/validation";
import {
  createServer,
  deleteServer,
  driftAll,
  driftFor,
  exportLibrary,
  getServer,
  importFromRegistry,
  installServer,
  listEvents,
  listHarnesses,
  listServers,
  overview,
  pushServer,
  repairAll,
  repairHarness,
  revealServer,
  scanAll,
  scanHarness,
  setFavorite,
  uninstallServer,
  updateServer,
} from "../lib/store";
import { HOST, PORT } from "../lib/paths";
import { listRegistry } from "../lib/registry";

const t = initTRPC.create();

export const appRouter = t.router({
  system: t.router({
    overview: t.procedure.query(() => overview()),
    health: t.procedure.query(() => ({
      ok: true,
      name: "mcpdeck",
      version: "0.1.0",
      host: HOST,
      port: PORT,
      uptime: Math.round(process.uptime()),
      harnesses: HARNESSES.length,
      registeredServers: REGISTRY.length,
    })),
    export: t.procedure.query(() => exportLibrary()),
  }),

  servers: t.router({
    list: t.procedure
      .input(listServersInput)
      .query(({ input }) => listServers(input)),

    get: t.procedure
      .input(z.object({ id: z.string() }))
      .query(({ input }) => getServer(input.id)),

    create: t.procedure
      .input(createServerInput)
      .mutation(({ input }) => createServer(input)),

    update: t.procedure
      .input(updateServerInput)
      .mutation(({ input }) => updateServer(input)),

    delete: t.procedure
      .input(deleteServerInput)
      .mutation(({ input }) => deleteServer(input.id, input.removeFromHarnesses)),

    favorite: t.procedure
      .input(z.object({ id: z.string(), value: z.boolean() }))
      .mutation(({ input }) => setFavorite(input.id, input.value)),

    reveal: t.procedure
      .input(z.object({ id: z.string() }))
      .query(({ input }) => revealServer(input.id)),

    install: t.procedure
      .input(installInput)
      .mutation(({ input }) => installServer(input.serverId, input.harnessId)),

    installMany: t.procedure
      .input(installManyInput)
      .mutation(({ input }) => {
        const results = input.harnessIds.map((harnessId) => {
          try {
            const result = installServer(input.serverId, harnessId);
            return {
              harnessId,
              ok: true as const,
              configPath: result.configPath,
              backupPath: result.backupPath,
              warning: result.warning,
            };
          } catch (error) {
            return {
              harnessId,
              ok: false as const,
              error: error instanceof Error ? error.message : String(error),
            };
          }
        });
        return {
          installed: results.filter((result) => result.ok).length,
          results,
        };
      }),

    uninstall: t.procedure
      .input(uninstallInput)
      .mutation(({ input }) => uninstallServer(input.serverId, input.harnessId)),

    push: t.procedure
      .input(z.object({ id: z.string() }))
      .mutation(({ input }) => pushServer(input.id)),
  }),

  harnesses: t.router({
    list: t.procedure.query(() => listHarnesses()),

    scan: t.procedure
      .input(harnessIdInput)
      .mutation(({ input }) => scanHarness(input.harnessId)),

    scanAll: t.procedure.mutation(() => scanAll()),

    drift: t.procedure
      .input(harnessIdInput)
      .query(({ input }) => driftFor(input.harnessId)),

    driftAll: t.procedure.query(() => driftAll()),

    repair: t.procedure
      .input(harnessIdInput)
      .mutation(({ input }) => repairHarness(input.harnessId)),

    repairAll: t.procedure.mutation(() => repairAll()),
  }),

  activity: t.router({
    list: t.procedure
      .input(eventsInput)
      .query(({ input }) => listEvents(input?.limit ?? 50)),
  }),

  registry: t.router({
    list: t.procedure.query(() => listRegistry()),

    import: t.procedure
      .input(importRegistryInput)
      .mutation(({ input }) => importFromRegistry(input.registryId)),
  }),
});

export type AppRouter = typeof appRouter;
