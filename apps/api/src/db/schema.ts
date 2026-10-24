import {
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const servers = sqliteTable("servers", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  description: text("description").notNull().default(""),
  transport: text("transport").notNull().default("stdio"),
  command: text("command"),
  args: text("args").notNull().default("[]"),
  url: text("url"),
  envEnc: text("env_enc").notNull().default(""),
  envKeys: text("env_keys").notNull().default("[]"),
  headerEnc: text("header_enc").notNull().default(""),
  headerKeys: text("header_keys").notNull().default("[]"),
  requiredEnv: text("required_env").notNull().default("[]"),
  requiredHeaders: text("required_headers").notNull().default("[]"),
  category: text("category").notNull().default("General"),
  tags: text("tags").notNull().default("[]"),
  homepage: text("homepage"),
  repository: text("repository"),
  source: text("source").notNull().default("manual"),
  sourceId: text("source_id"),
  isFavorite: integer("is_favorite").notNull().default(0),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const installations = sqliteTable(
  "installations",
  {
    id: text("id").primaryKey(),
    serverId: text("server_id").notNull(),
    harnessId: text("harness_id").notNull(),
    enabled: integer("enabled").notNull().default(1),
    configKey: text("config_key").notNull().default(""),
    configPath: text("config_path").notNull().default(""),
    installedAt: integer("installed_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("installations_server_harness_idx").on(
      table.serverId,
      table.harnessId,
    ),
  ],
);

export const events = sqliteTable("events", {
  id: text("id").primaryKey(),
  kind: text("kind").notNull(),
  status: text("status").notNull().default("success"),
  harnessId: text("harness_id"),
  serverId: text("server_id"),
  serverName: text("server_name"),
  message: text("message").notNull().default(""),
  createdAt: integer("created_at").notNull(),
});

export const meta = sqliteTable("meta", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});
