/** @jsxImportSource react */
import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { configureStudioApiBasePath } from "./api";
import { createStudioRouter } from "./studio-router";
import { createStudioQueryClient } from "./query-client";

const root = document.querySelector("[data-studio-root]");
if (root) {
  const basePath = root.getAttribute("data-studio-base-path") ?? "/studio";
  configureStudioApiBasePath(basePath);
  root.textContent = "";
  const queryClient = createStudioQueryClient();
  const router = createStudioRouter(basePath, App);
  createRoot(root).render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}
