"use client";

import { useSyncExternalStore } from "react";
import { ThemeProvider, useTheme } from "next-themes";
import { KonstaProvider } from "konsta/react";
import { Toaster } from "@/components/ui/sonner";

const noopSubscribe = () => () => {};

// next-themes reads localStorage synchronously on the client's first
// hydrating render (to avoid a full-page flash of the wrong theme), which
// means `resolvedTheme` is already correct before React has even finished
// hydrating — one render pass ahead of the server, which rendered with no
// theme info at all. Feeding that straight into Konsta's `dark` prop made
// it emit different classNames server vs. client on that first render,
// causing a real hydration mismatch (not just a console nag). Deferring to
// `false` (matching the server) until after hydration via
// useSyncExternalStore's server-snapshot fallback fixes it without the
// setState-in-effect pattern this repo's lint config disallows.
function useHasMounted() {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false
  );
}

function KonstaThemeBridge({ children }: { children: React.ReactNode }) {
  const { resolvedTheme } = useTheme();
  const hasMounted = useHasMounted();
  return (
    <KonstaProvider theme="ios" dark={hasMounted && resolvedTheme === "dark"}>
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
