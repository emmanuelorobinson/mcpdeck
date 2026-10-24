"use client";

import { CATEGORIES, type ServerDTO, type Transport } from "@mcpdeck/shared";
import { Eye, EyeOff, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export type KeyRow = { key: string; value: string; existing: boolean };

export type ServerFormState = {
  name: string;
  description: string;
  category: string;
  tags: string;
  transport: Transport;
  command: string;
  argsText: string;
  url: string;
  homepage: string;
  repository: string;
  envRows: KeyRow[];
  headerRows: KeyRow[];
};

export const blankForm: ServerFormState = {
  name: "",
  description: "",
  category: "Developer",
  tags: "",
  transport: "stdio",
  command: "npx",
  argsText: "",
  url: "",
  homepage: "",
  repository: "",
  envRows: [],
  headerRows: [],
};

export function toFormState(server: ServerDTO): ServerFormState {
  return {
    name: server.name,
    description: server.description,
    category: server.category,
    tags: server.tags.join(", "),
    transport: server.transport,
    command: server.command ?? "",
    argsText: server.args.join("\n"),
    url: server.url ?? "",
    homepage: server.homepage ?? "",
    repository: server.repository ?? "",
    envRows: server.envKeys.map((key) => ({
      key,
      value: "",
      existing: true,
    })),
    headerRows: server.headerKeys.map((key) => ({
      key,
      value: "",
      existing: true,
    })),
  };
}

export function payloadFromForm(form: ServerFormState, server?: ServerDTO) {
  const env: Record<string, string> = {};
  const headers: Record<string, string> = {};
  for (const row of form.envRows) {
    if (row.key.trim() && row.value.trim()) env[row.key.trim()] = row.value;
  }
  for (const row of form.headerRows) {
    if (row.key.trim() && row.value.trim())
      headers[row.key.trim()] = row.value;
  }

  const existingEnv = new Set(server?.envKeys ?? []);
  const existingHeaders = new Set(server?.headerKeys ?? []);
  const nextEnv = new Set(form.envRows.map((row) => row.key));
  const nextHeaders = new Set(form.headerRows.map((row) => row.key));

  return {
    name: form.name.trim(),
    description: form.description.trim(),
    category: form.category,
    tags: form.tags
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean),
    transport: form.transport,
    command: form.command.trim() || undefined,
    args: form.argsText
      .split("\n")
      .map((arg) => arg.trim())
      .filter(Boolean),
    url: form.url.trim() || undefined,
    homepage: form.homepage.trim() || undefined,
    repository: form.repository.trim() || undefined,
    env,
    headers,
    envKeys: [...nextEnv].filter((key) => key.trim()),
    headerKeys: [...nextHeaders].filter((key) => key.trim()),
    removeEnvKeys: [...existingEnv].filter((key) => !nextEnv.has(key)),
    removeHeaderKeys: [...existingHeaders].filter(
      (key) => !nextHeaders.has(key),
    ),
  };
}

function SectionTitle({
  children,
  right,
}: {
  children: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h3 className="text-xs font-semibold text-foreground">{children}</h3>
      {right}
    </div>
  );
}

export function ServerFormFields({
  form,
  setForm,
  requiredEnv = [],
  requiredHeaders = [],
}: {
  form: ServerFormState;
  setForm: (updater: (current: ServerFormState) => ServerFormState) => void;
  requiredEnv?: string[];
  requiredHeaders?: string[];
}) {
  const [showSecrets, setShowSecrets] = useState(false);

  const patch = <K extends keyof ServerFormState>(
    key: K,
    value: ServerFormState[K],
  ) => setForm((current) => ({ ...current, [key]: value }));

  const updateRow = (
    kind: "envRows" | "headerRows",
    index: number,
    patchRow: Partial<KeyRow>,
  ) => {
    setForm((current) => ({
      ...current,
      [kind]: current[kind].map((row, rowIndex) =>
        rowIndex === index ? { ...row, ...patchRow } : row,
      ),
    }));
  };

  const removeRow = (kind: "envRows" | "headerRows", index: number) => {
    setForm((current) => ({
      ...current,
      [kind]: current[kind].filter((_, rowIndex) => rowIndex !== index),
    }));
  };

  const addRow = (kind: "envRows" | "headerRows") => {
    setForm((current) => ({
      ...current,
      [kind]: [...current[kind], { key: "", value: "", existing: false }],
    }));
  };

  return (
    <div className="space-y-7">
      <section>
        <SectionTitle>Identity</SectionTitle>
        <div className="space-y-3.5">
          <Field label="Display name" required>
            <Input
              value={form.name}
              onChange={(event) => patch("name", event.target.value)}
              placeholder="e.g. Playwright"
              autoFocus
            />
          </Field>
          <Field label="Description">
            <Textarea
              value={form.description}
              onChange={(event) => patch("description", event.target.value)}
              placeholder="What does this server let your agent do?"
              className="min-h-[68px]"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Category">
              <Select
                value={form.category}
                onValueChange={(value) => patch("category", value)}
              >
                <SelectTrigger className="h-9 w-full" aria-label="Category">
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((category) => (
                    <SelectItem key={category} value={category}>
                      {category}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Tags" hint="Comma separated">
              <Input
                value={form.tags}
                onChange={(event) => patch("tags", event.target.value)}
                placeholder="browser, testing"
              />
            </Field>
          </div>
        </div>
      </section>

      <section className="border-t border-border pt-6">
        <SectionTitle>Connection</SectionTitle>
        <div className="mb-4 inline-flex rounded-lg border border-border bg-muted/40 p-0.5">
          {(["stdio", "http"] as const).map((transport) => (
            <button
              key={transport}
              type="button"
              onClick={() => patch("transport", transport)}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                form.transport === transport
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {transport === "stdio" ? "Local process" : "Remote URL"}
            </button>
          ))}
        </div>

        {form.transport === "stdio" ? (
          <div className="space-y-3.5">
            <Field label="Command" required>
              <Input
                value={form.command}
                onChange={(event) => patch("command", event.target.value)}
                placeholder="npx"
                className="font-mono text-sm"
              />
            </Field>
            <Field
              label="Arguments"
              hint="One argument per line. Spaces inside a line are preserved."
            >
              <Textarea
                value={form.argsText}
                onChange={(event) => patch("argsText", event.target.value)}
                placeholder={"-y\n@playwright/mcp@latest"}
                className="min-h-[88px] font-mono text-xs leading-5"
                spellCheck={false}
              />
            </Field>
          </div>
        ) : (
          <Field label="Server URL" required>
            <Input
              value={form.url}
              onChange={(event) => patch("url", event.target.value)}
              placeholder="https://mcp.example.com/mcp"
              className="font-mono text-sm"
            />
          </Field>
        )}
      </section>

      <section className="border-t border-border pt-6">
        <SectionTitle
          right={
            <button
              type="button"
              onClick={() => setShowSecrets((value) => !value)}
              className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              {showSecrets ? (
                <EyeOff className="size-3.5" />
              ) : (
                <Eye className="size-3.5" />
              )}
              {showSecrets ? "Hide" : "Show"} values
            </button>
          }
        >
          Environment variables
        </SectionTitle>
        {requiredEnv.length ? (
          <p className="mb-2.5 text-xs text-amber">
            required: {requiredEnv.join(", ")}
          </p>
        ) : null}
        <div className="space-y-2">
          {form.envRows.map((row, index) => (
            <div key={`env-${index}`} className="flex items-start gap-1.5">
              <Input
                value={row.key}
                disabled={row.existing}
                onChange={(event) =>
                  updateRow("envRows", index, { key: event.target.value })
                }
                placeholder="KEY"
                className="w-[38%] font-mono text-xs disabled:opacity-60"
              />
              <Input
                type={showSecrets ? "text" : "password"}
                value={row.value}
                onChange={(event) =>
                  updateRow("envRows", index, { value: event.target.value })
                }
                placeholder={
                  row.existing ? "Stored — blank keeps it" : "value"
                }
                className="flex-1 font-mono text-xs"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => removeRow("envRows", index)}
                aria-label="Remove variable"
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          ))}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="mt-2 -ml-2 text-muted-foreground"
          onClick={() => addRow("envRows")}
        >
          <Plus className="size-3.5" /> Add variable
        </Button>
      </section>

      <section className="border-t border-border pt-6">
        <SectionTitle>HTTP headers</SectionTitle>
        {requiredHeaders.length ? (
          <p className="mb-2.5 text-xs text-amber">
            required: {requiredHeaders.join(", ")}
          </p>
        ) : null}
        <div className="space-y-2">
          {form.headerRows.map((row, index) => (
            <div key={`header-${index}`} className="flex items-start gap-1.5">
              <Input
                value={row.key}
                disabled={row.existing}
                onChange={(event) =>
                  updateRow("headerRows", index, { key: event.target.value })
                }
                placeholder="Authorization"
                className="w-[38%] font-mono text-xs disabled:opacity-60"
              />
              <Input
                type={showSecrets ? "text" : "password"}
                value={row.value}
                onChange={(event) =>
                  updateRow("headerRows", index, { value: event.target.value })
                }
                placeholder={
                  row.existing ? "Stored — blank keeps it" : "Bearer …"
                }
                className="flex-1 font-mono text-xs"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => removeRow("headerRows", index)}
                aria-label="Remove header"
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          ))}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="mt-2 -ml-2 text-muted-foreground"
          onClick={() => addRow("headerRows")}
        >
          <Plus className="size-3.5" /> Add header
        </Button>
      </section>

      <section className="border-t border-border pt-6">
        <SectionTitle>Links</SectionTitle>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Homepage">
            <Input
              value={form.homepage}
              onChange={(event) => patch("homepage", event.target.value)}
              placeholder="https://…"
            />
          </Field>
          <Field label="Repository">
            <Input
              value={form.repository}
              onChange={(event) => patch("repository", event.target.value)}
              placeholder="https://github.com/…"
            />
          </Field>
        </div>
      </section>
    </div>
  );
}
