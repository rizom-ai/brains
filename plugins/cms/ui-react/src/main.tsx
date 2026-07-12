import { createRoot } from "react-dom/client";
import { App } from "./App";

const root = document.querySelector("[data-cms-root]");
if (root) {
  root.textContent = "";
  createRoot(root).render(<App />);
}
