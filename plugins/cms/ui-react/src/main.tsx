import { QueryClientProvider } from "@tanstack/react-query";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { createCmsQueryClient } from "./query-client";

const root = document.querySelector("[data-cms-root]");
if (root) {
  root.textContent = "";
  const queryClient = createCmsQueryClient();
  createRoot(root).render(
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>,
  );
}
