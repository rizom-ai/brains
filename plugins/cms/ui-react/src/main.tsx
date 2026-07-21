import { QueryClientProvider } from "@tanstack/react-query";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { configureCmsApiBasePath } from "./api";
import { createCmsQueryClient } from "./query-client";

const root = document.querySelector("[data-cms-root]");
if (root) {
  configureCmsApiBasePath(root.getAttribute("data-cms-base-path") ?? "/cms");
  root.textContent = "";
  const queryClient = createCmsQueryClient();
  createRoot(root).render(
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>,
  );
}
