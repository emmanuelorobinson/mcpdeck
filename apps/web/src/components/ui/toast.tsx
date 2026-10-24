"use client";

import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";

type Tone = "default" | "success" | "error";

type ToastContextValue = {
  push: (toast: {
    title: string;
    description?: string;
    tone?: Tone;
  }) => void;
};

export function useToast(): ToastContextValue {
  return {
    push: ({ title, description, tone = "default" }) => {
      if (tone === "success") {
        toast.success(title, { description });
      } else if (tone === "error") {
        toast.error(title, { description });
      } else {
        toast(title, { description });
      }
    },
  };
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <Toaster position="bottom-right" />
    </>
  );
}
