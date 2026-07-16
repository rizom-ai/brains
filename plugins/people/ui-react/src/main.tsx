import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { PeopleApp, type PeopleBootstrap } from "./App";

const root = document.querySelector<HTMLElement>("[data-people-root]");
if (!root) throw new Error("People root element not found");

const bootstrapRole = root.dataset["peopleRole"];
const bootstrap: PeopleBootstrap = {
  displayName: root.dataset["peopleName"] ?? "Authenticated",
  role:
    bootstrapRole === "anchor" ||
    bootstrapRole === "trusted" ||
    bootstrapRole === "public"
      ? bootstrapRole
      : "public",
  routePath: root.dataset["peopleRoute"] ?? "/admin",
};

createRoot(root).render(
  <StrictMode>
    <PeopleApp bootstrap={bootstrap} />
  </StrictMode>,
);
