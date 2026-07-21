import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { configureCmsApiBasePath } from "./api";
import { createCmsRouter } from "./cms-router";
import { createCmsQueryClient } from "./query-client";

const root = document.querySelector("[data-cms-root]");
if (root) {
  const basePath = root.getAttribute("data-cms-base-path") ?? "/cms";
  configureCmsApiBasePath(basePath);
  root.textContent = "";
  const queryClient = createCmsQueryClient();
  const router = createCmsRouter(basePath, App);
  createRoot(root).render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}
