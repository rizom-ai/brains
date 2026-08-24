/** @jsxImportSource react */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { PeopleApp, type PeopleBootstrap } from "./App";

const root = document.querySelector<HTMLElement>("[data-people-root]");
if (!root) throw new Error("People root element not found");

const bootstrapRole = root.dataset["peopleRole"];
const initialPersonId = root.dataset["peoplePerson"];
const bootstrap: PeopleBootstrap = {
  userId: root.dataset["peopleUserId"] ?? "",
  displayName: root.dataset["peopleName"] ?? "Authenticated",
  ...(initialPersonId ? { initialPersonId } : {}),
  role:
    bootstrapRole === "admin" ||
    bootstrapRole === "trusted" ||
    bootstrapRole === "public"
      ? bootstrapRole
      : "public",
  isAnchor: root.dataset["peopleIsAnchor"] === "true",
  brainName: root.dataset["peopleBrainName"] ?? "brain",
  routePath: root.dataset["peopleRoute"] ?? "/admin",
};

createRoot(root).render(
  <StrictMode>
    <PeopleApp bootstrap={bootstrap} />
  </StrictMode>,
);
