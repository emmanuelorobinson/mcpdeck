import { z } from "zod";

const keyList = z.array(z.string().trim().min(1)).default([]);

const serverFields = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().max(600).default(""),
  transport: z.enum(["stdio", "http"]).default("stdio"),
  command: z.string().trim().optional(),
  args: z.array(z.string()).default([]),
  url: z.string().trim().optional(),
  env: z.record(z.string(), z.string()).default({}),
  envKeys: keyList.optional(),
  requiredEnv: keyList.optional(),
  requiredHeaders: keyList.optional(),
  removeEnvKeys: keyList.optional(),
  headers: z.record(z.string(), z.string()).default({}),
  headerKeys: keyList.optional(),
  removeHeaderKeys: keyList.optional(),
  category: z.string().trim().min(1).default("General"),
  tags: z.array(z.string().trim().min(1)).default([]),
  homepage: z.string().trim().optional(),
  repository: z.string().trim().optional(),
  isFavorite: z.boolean().default(false),
});

export const createServerInput = serverFields;

export const updateServerInput = serverFields.partial().extend({
  id: z.string().min(1),
});

export const installInput = z.object({
  serverId: z.string().min(1),
  harnessId: z.string().min(1),
});

export const installManyInput = z.object({
  serverId: z.string().min(1),
  harnessIds: z.array(z.string().min(1)).min(1),
});

export const uninstallInput = z.object({
  serverId: z.string().min(1),
  harnessId: z.string().min(1),
});

export const harnessIdInput = z.object({ harnessId: z.string().min(1) });

export const importRegistryInput = z.object({
  registryId: z.string().min(1),
});

export const listServersInput = z
  .object({
    query: z.string().optional(),
    category: z.string().optional(),
    transport: z.enum(["stdio", "http"]).optional(),
    harnessId: z.string().optional(),
    favoritesOnly: z.boolean().optional(),
    needsSetupOnly: z.boolean().optional(),
  })
  .optional();

export const eventsInput = z
  .object({ limit: z.number().int().min(1).max(200).default(50) })
  .optional();

export const deleteServerInput = z.object({
  id: z.string().min(1),
  removeFromHarnesses: z.boolean().default(true),
});
