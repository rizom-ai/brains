/** @jsxImportSource react */
import { QueryClientProvider } from "@tanstack/react-query";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { GuestApp } from "./GuestApp";
import { createWebChatQueryClient } from "./query-client";

const root = document.querySelector("[data-web-chat-root]");

if (root) {
  const queryClient = createWebChatQueryClient();
  createRoot(root).render(
    <QueryClientProvider client={queryClient}>
      {root.hasAttribute("data-guest-chat") ? <GuestApp /> : <App />}
    </QueryClientProvider>,
  );
}
