import { REGISTRY, type RegistryServer } from "@mcpdeck/shared";

export function listRegistry(query?: string): RegistryServer[] {
  const term = query?.trim().toLowerCase();
  if (!term) return REGISTRY;
  return REGISTRY.filter((server) => {
    const haystack = [
      server.name,
      server.slug,
      server.description,
      server.category,
      ...server.tags,
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(term);
  });
}
