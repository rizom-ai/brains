/** @jsxImportSource react */
import { createRoot } from "react-dom/client";
import { App } from "./App";

const root = document.querySelector("[data-web-chat-root]");

if (root) {
  createRoot(root).render(<App />);
}
