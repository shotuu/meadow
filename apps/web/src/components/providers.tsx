"use client";

import { ThemeProvider, useTheme } from "next-themes";
import { KonstaProvider } from "konsta/react";
import { Toaster } from "@/components/ui/sonner";

function KonstaThemeBridge({ children }: { children: React.ReactNode }) {
  const { resolvedTheme } = useTheme();
  return (
    <KonstaProvider theme="ios" dark={resolvedTheme === "dark"}>
      {children}
    </KonstaProvider>
  );
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <KonstaThemeBridge>{children}</KonstaThemeBridge>
      <Toaster />
    </ThemeProvider>
  );
}
