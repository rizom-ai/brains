/** @jsxImportSource react */

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AccountApp, type AccountBootstrap } from "./App";

const root = document.querySelector<HTMLElement>("[data-account-root]");
if (!root) throw new Error("Account root element not found");

const role = root.dataset["accountRole"];
const bootstrap: AccountBootstrap = {
  displayName: root.dataset["accountName"] ?? "Your account",
  role:
    role === "admin" || role === "trusted" || role === "public"
      ? role
      : "public",
  routePath: root.dataset["accountRoute"] ?? "/account",
};

createRoot(root).render(
  <StrictMode>
    <AccountApp bootstrap={bootstrap} />
  </StrictMode>,
);
