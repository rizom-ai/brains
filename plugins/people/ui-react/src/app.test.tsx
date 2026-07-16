import { describe, expect, it } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  PeopleApp,
  assuranceLabel,
  initials,
  roleLabel,
  type PeopleBootstrap,
} from "./App";
import type { AuthAdminUserSummary } from "@brains/auth-service/admin-contracts";

const anchor: PeopleBootstrap = {
  displayName: "Yeehaa",
  role: "anchor",
  routePath: "/admin",
};

const user: AuthAdminUserSummary = {
  userId: "usr_mira",
  personId: "per_mira",
  displayName: "Mira Reyes",
  role: "trusted",
  status: "active",
  permissionLevel: "trusted",
  identities: [
    {
      id: "idn_discord",
      personId: "per_mira",
      userId: "usr_mira",
      type: "discord",
      visibility: "private",
      label: "m***",
      createdAt: 1,
      evidence: [
        {
          sourceKind: "agent",
          assurance: "asserted",
        },
      ],
    },
  ],
  passkeys: [],
  agents: [
    {
      agentId: "mira.example",
      personId: "per_mira",
      status: "active",
      createdByUserId: "usr_anchor",
      consentedByUserId: "usr_mira",
      createdAt: 1,
      updatedAt: 1,
    },
  ],
};

const representation = user.agents[0];
const identity = user.identities[0];
if (!representation || !identity) {
  throw new Error("People test fixture is incomplete");
}

describe("People surface", () => {
  it("renders the anchor access ledger without dashboard markup", () => {
    const html = renderToStaticMarkup(
      createElement(PeopleApp, { bootstrap: anchor, initialUsers: [user] }),
    );

    expect(html).toContain("Administration");
    expect(html).toContain('aria-current="page"');
    expect(html).toContain("Access roster");
    expect(html).toContain("Mira Reyes");
    expect(html).toContain("Linked agents");
    expect(html).toContain("Asserted — cannot authenticate");
    expect(html).toContain("Add person");
    expect(html).not.toContain("dashboard-tab-panel");
  });

  it("shows only self-service representation consent to non-Anchors", () => {
    const html = renderToStaticMarkup(
      createElement(PeopleApp, {
        bootstrap: { ...anchor, displayName: "Mira", role: "trusted" },
        initialRepresentations: [representation],
      }),
    );

    expect(html).toContain("My agents");
    expect(html).not.toContain("Access roster");
    expect(html).not.toContain("Add person");
  });

  it("uses canonical auth vocabulary and evidence labels", () => {
    expect(roleLabel("anchor")).toBe("Anchor");
    expect(initials("Mira Reyes")).toBe("MR");
    expect(assuranceLabel(identity)).toBe("Asserted — cannot authenticate");
  });
});
