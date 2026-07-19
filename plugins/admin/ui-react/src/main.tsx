import { QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { PeopleApp, type PeopleBootstrap } from "./App";
import { createAdminQueryClient } from "./query-client";

const root = document.querySelector<HTMLElement>("[data-people-root]");
if (!root) throw new Error("People root element not found");

const bootstrapRole = root.dataset["peopleRole"];
const bootstrap: PeopleBootstrap = {
  userId: root.dataset["peopleUserId"] ?? "",
  displayName: root.dataset["peopleName"] ?? "Authenticated",
  role:
    bootstrapRole === "admin" ||
    bootstrapRole === "trusted" ||
    bootstrapRole === "public"
      ? bootstrapRole
      : "public",
  isAnchor: root.dataset["peopleIsAnchor"] === "true",
  brainName: root.dataset["peopleBrainName"] ?? "brain",
  routePath: root.dataset["peopleRoute"] ?? "/admin",
  registeredInterfaces: (root.dataset["peopleInterfaces"] ?? "")
    .split(",")
    .filter(Boolean),
};

const queryClient = createAdminQueryClient();
createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <PeopleApp bootstrap={bootstrap} />
    </QueryClientProvider>
  </StrictMode>,
);
