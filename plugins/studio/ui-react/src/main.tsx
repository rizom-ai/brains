/** @jsxImportSource react */
import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { StudioApi } from "./api";
import { StudioApiProvider } from "./studio-api-context";
import { createStudioRouter } from "./studio-router";
import { createStudioQueryClient } from "./query-client";

const root = document.querySelector("[data-studio-root]");
if (root) {
  const basePath = root.getAttribute("data-studio-base-path") ?? "/studio";
  const api = new StudioApi({ basePath });
  root.textContent = "";
  const queryClient = createStudioQueryClient();
  const router = createStudioRouter(basePath, App);
  createRoot(root).render(
    <QueryClientProvider client={queryClient}>
      <StudioApiProvider api={api}>
        <RouterProvider router={router} />
      </StudioApiProvider>
    </QueryClientProvider>,
  );
}
