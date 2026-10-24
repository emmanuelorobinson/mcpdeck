import { createTRPCReact } from "@trpc/react-query";
import type { AppRouter } from "@mcpdeck/api";

export const trpc = createTRPCReact<AppRouter>();
