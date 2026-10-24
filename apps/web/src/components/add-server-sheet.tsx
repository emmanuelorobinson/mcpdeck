"use client";

import { REGISTRY } from "@mcpdeck/shared";
import { useMemo, useState } from "react";
import { ServerGlyph } from "@/components/server-glyph";
import {
  blankForm,
  payloadFromForm,
  ServerFormFields,
  type ServerFormState,
} from "@/components/server-form";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { trpc } from "@/lib/trpc";
import { useRefresh } from "@/lib/use-refresh";

export function AddServerSheet({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [form, setForm] = useState<ServerFormState>(blankForm);
  const [template, setTemplate] = useState("blank");
  const [requiredEnv, setRequiredEnv] = useState<string[]>([]);
  const [requiredHeaders, setRequiredHeaders] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
  const refresh = useRefresh();

  const create = trpc.servers.create.useMutation();
  const templateOptions = useMemo(
    () => REGISTRY.map((entry) => ({ value: entry.id, entry })),
    [],
  );

  function reset() {
    setForm(blankForm);
    setTemplate("blank");
    setRequiredEnv([]);
    setRequiredHeaders([]);
    setError(null);
  }

  function applyTemplate(id: string) {
    setTemplate(id);
    setError(null);
    if (id === "blank") {
      setForm(blankForm);
      setRequiredEnv([]);
      setRequiredHeaders([]);
      return;
    }
    const entry = REGISTRY.find((item) => item.id === id);
    if (!entry) return;
    setForm({
      name: entry.name,
      description: entry.description,
      category: entry.category,
      tags: entry.tags.join(", "),
      transport: entry.transport,
      command: entry.command ?? "npx",
      argsText: (entry.args ?? []).join("\n"),
      url: entry.url ?? "",
      homepage: entry.homepage ?? "",
      repository: entry.repository ?? "",
      envRows: (entry.envKeys ?? []).map((key) => ({
        key: key.key,
        value: "",
        existing: false,
      })),
      headerRows: (entry.headerKeys ?? []).map((key) => ({
        key: key.key,
        value: "",
        existing: false,
      })),
    });
    setRequiredEnv(
      (entry.envKeys ?? [])
        .filter((key) => key.required)
        .map((key) => key.key),
    );
    setRequiredHeaders(
      (entry.headerKeys ?? [])
        .filter((key) => key.required)
        .map((key) => key.key),
    );
  }

  async function submit() {
    if (!form.name.trim()) {
      setError("Give the server a name.");
      return;
    }
    if (form.transport === "stdio" && !form.command.trim()) {
      setError("A local server needs a command.");
      return;
    }
    if (form.transport === "http" && !/^https?:\/\//.test(form.url.trim())) {
      setError("Enter a valid http(s) URL.");
      return;
    }
    setError(null);
    try {
      const payload = payloadFromForm(form);
      const created = await create.mutateAsync({
        ...payload,
        requiredEnv,
        requiredHeaders,
      });
      await refresh();
      toast.push({
        title: `${created.name} added`,
        description:
          created.missingRequired.length > 0
            ? `Add ${created.missingRequired.join(", ")} before installing.`
            : "Ready to install into any harness.",
        tone: "success",
      });
      onCreated(created.id);
      onClose();
      reset();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          onClose();
          reset();
        }
      }}
    >
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 p-0 sm:max-w-[600px]"
      >
        <SheetHeader className="gap-1 border-b p-5 pr-12">
          <p className="label-mono">New server</p>
          <SheetTitle>Add to your library</SheetTitle>
          <SheetDescription>
            Store the config once. Install it anywhere later.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-5">
          <div className="mb-5">
            <label className="label-mono mb-2 block">Start from</label>
            <div className="flex items-center gap-2">
              <Select value={template} onValueChange={applyTemplate}>
                <SelectTrigger className="h-9 flex-1" aria-label="Start from template">
                  <SelectValue placeholder="Blank configuration" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="blank">Blank configuration</SelectItem>
                  {templateOptions.map(({ value, entry }) => (
                    <SelectItem key={value} value={value}>
                      {entry.name} — {entry.category}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {template !== "blank" ? (
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-border bg-muted/40">
                  <ServerGlyph
                    category={
                      REGISTRY.find((entry) => entry.id === template)
                        ?.category ?? "General"
                    }
                    name={REGISTRY.find((entry) => entry.id === template)?.name}
                    size="sm"
                  />
                </span>
              ) : null}
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">
              Templates prefill the command and the keys that need values.
            </p>
          </div>

          <ServerFormFields
            form={form}
            setForm={setForm}
            requiredEnv={requiredEnv}
            requiredHeaders={requiredHeaders}
          />
        </div>

        <SheetFooter className="border-t p-5">
          <div className="flex w-full items-center justify-between gap-3">
            <span className="min-w-0 truncate text-xs text-rose">{error}</span>
            <div className="flex shrink-0 items-center gap-2">
              <Button
                variant="ghost"
                onClick={() => {
                  onClose();
                  reset();
                }}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                loading={create.isPending}
                onClick={submit}
              >
                Add server
              </Button>
            </div>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
