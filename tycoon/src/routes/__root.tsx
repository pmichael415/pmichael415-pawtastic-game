import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { Building2, Gamepad2, GraduationCap, House, ShoppingBag } from "lucide-react";
import { useSession } from "@/lib/auth";
import { useCloudSync } from "@/game/cloud";
import { EntitlementsProvider } from "@/lib/entitlements";
import { Toaster } from "@/components/ui/sonner";
import { startSession } from "@/lib/analytics";
import { ShareSheet } from "@/components/game/ShareSheet";
import { TeamPicker } from "@/components/game/TeamPicker";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">This pup wandered off</h2>
        <div className="mt-6">
          <Link to="/" className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
            Back to PAWtastic Games
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">This page didn't load</h1>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            Try again
          </button>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { name: "theme-color", content: "#FAF8F5" },
      { title: "PAWtastic Games" },
      { name: "description", content: "Free dog games from PAWtastic Academy: Daycare Tycoon and Recess Rush." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", type: "image/png", href: "/favicon.png" },
      { rel: "apple-touch-icon", href: "/brand/pawtastic-logo.png" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

// One navigation bar for every PAWtastic game. "Home" is the PAWtastic Games hub; Visit Us is linked from it.
const TABS = [
  { to: "/", label: "Home", icon: House },
  { to: "/daycare", label: "Daycare", icon: Building2 },
  { to: "/recess", label: "Recess Rush", icon: Gamepad2 },
  { to: "/graduation", label: "Graduation", icon: GraduationCap },
  { to: "/shop", label: "Shop", icon: ShoppingBag },
] as const;

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const { user } = useSession();
  useCloudSync(user?.id ?? null);
  useEffect(() => startSession(window.location.pathname), []);
  return (
    <QueryClientProvider client={queryClient}>
      <EntitlementsProvider>
      <div className="mx-auto min-h-dvh max-w-xl bg-background pb-24">
        <Outlet />
      </div>
      <nav aria-label="Game tabs" className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
        <ul className="mx-auto grid max-w-xl grid-cols-5">
          {TABS.map((t) => (
            <li key={t.to}>
              <Link
                to={t.to}
                className="flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium text-muted-foreground"
                activeProps={{ className: "text-primary" }}
                activeOptions={{ exact: true }}
              >
                <t.icon className="h-[22px] w-[22px]" strokeWidth={1.75} aria-hidden />
                {t.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <ShareSheet />
      <TeamPicker />
      <Toaster position="top-center" offset={8} mobileOffset={{ top: 8 }} richColors duration={1800} />
      </EntitlementsProvider>
    </QueryClientProvider>
  );
}
