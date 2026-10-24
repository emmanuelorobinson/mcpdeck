import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/app-shell";
import { Providers } from "@/components/providers";
import { ToastProvider } from "@/components/ui/toast";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
});

export const metadata: Metadata = {
  title: "MCP Deck — one deck for every MCP",
  description:
    "Store every Model Context Protocol server once, then sync and install it across Claude Code, Cursor, VS Code, Codex, OpenCode and more.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={cn("dark font-sans", geist.variable)}
      suppressHydrationWarning
    >
      <body className="min-h-svh bg-background text-foreground">
        <Providers>
          <ToastProvider>
            <TooltipProvider>
              <AppShell>{children}</AppShell>
            </TooltipProvider>
          </ToastProvider>
        </Providers>
      </body>
    </html>
  );
}
