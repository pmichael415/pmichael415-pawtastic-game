// Private review build: the same game code, routed in memory (artifact pages can't use URL paths),
// with the backend stubbed out. Guest play only — progress stays in this browser.
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient } from "@tanstack/react-query";
import { RouterProvider, createMemoryHistory, createRouter } from "@tanstack/react-router";
import { routeTree } from "../src/routeTree.gen";
import "../src/styles.css";

// The Start shell renders <html>/<head>; in a plain client app the page already has those.
(routeTree as unknown as { options: Record<string, unknown> }).options["shellComponent"] = undefined;

const start = location.hash.startsWith("#") && /^#[a-z-]+$/.test(location.hash) ? "/" + location.hash.slice(1) : "/";
const router = createRouter({ routeTree, context: { queryClient: new QueryClient() }, history: createMemoryHistory({ initialEntries: [start] }) });

function ReviewBanner() {
  return (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 60, background: "#102c49", color: "#fff", font: "700 11px/1.6 Nunito, system-ui, sans-serif", textAlign: "center", padding: "2px 8px" }}>
      Private review build · guest play only · sign-in &amp; purchases off · progress stays in this browser
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ReviewBanner />
    <div style={{ height: 20 }} />
    <RouterProvider router={router} />
  </StrictMode>,
);
