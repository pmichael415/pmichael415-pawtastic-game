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
import { Building2, Gamepad2, MapPin, ShoppingBag, UserRound } from "lucide-react";
import { useSession } from "@/lib/auth";
import { useCloudSync } from "@/game/cloud";
import { EntitlementsProvider } from "@/lib/entitlements";
import { Toaster } from "@/components/ui/sonner";

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
            Back to the daycare
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
      { name: "theme-color", content: "#0057A7" },
      { title: "PAWtastic Tycoon" },
      { name: "description", content: "Run your own PAWtastic Academy dog daycare." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", type: "image/png", href: "/favicon.png" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Fredoka:wght@500;600;700&family=Nunito:wght@500;700;800&display=swap" },
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

const TABS = [
  { to: "/", label: "Tycoon", icon: Building2 },
  { to: "/recess", label: "Recess Rush", icon: Gamepad2 },
  { to: "/shop", label: "Shop", icon: ShoppingBag },
  { to: "/visit", label: "Visit Us", icon: MapPin },
  { to: "/account", label: "Account", icon: UserRound },
] as const;

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const { user } = useSession();
  useCloudSync(user?.id ?? null);
  return (
    <QueryClientProvider client={queryClient}>
      <EntitlementsProvider>
      <div className="mx-auto min-h-dvh max-w-xl bg-sky-gradient pb-24">
        <Outlet />
      </div>
      <nav aria-label="Game tabs" className="fixed inset-x-0 bottom-0 z-40 border-t-2 border-secondary bg-card pb-[env(safe-area-inset-bottom)]">
        <ul className="mx-auto grid max-w-xl grid-cols-5">
          {TABS.map((t) => (
            <li key={t.to}>
              <Link
                to={t.to}
                className="flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-bold text-muted-foreground"
                activeProps={{ className: "text-primary" }}
                activeOptions={{ exact: true }}
              >
                <t.icon className="h-6 w-6" aria-hidden />
                {t.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <Toaster position="bottom-center" offset={96} mobileOffset={{ bottom: 96 }} richColors duration={1800} />
      </EntitlementsProvider>
    </QueryClientProvider>
  );
}
