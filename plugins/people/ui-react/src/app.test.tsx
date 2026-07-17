import { describe, expect, it } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  PeopleApp,
  PromotionReconciliationSummary,
  assuranceLabel,
  initials,
  promotionReconciliationDefaults,
  roleLabel,
  type PeopleBootstrap,
} from "./App";
import type {
  AuthAdminUserSummary,
  AuthAgentPersonReconciliationResponse,
} from "@brains/auth-service/admin-contracts";

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

  it("preselects the only exact independently verified person", () => {
    const reconciliation: AuthAgentPersonReconciliationResponse = {
      state: "unique_verified_match",
      suggestedUserId: user.userId,
      claims: [
        {
          index: 0,
          type: "did",
          label: "Mira DID",
          state: "verified_match",
          owner: {
            personId: user.personId,
            userId: user.userId,
            displayName: user.displayName,
            status: user.status,
          },
        },
      ],
    };

    expect(
      promotionReconciliationDefaults(reconciliation, "usr_other"),
    ).toEqual({
      accessPath: "link",
      userId: user.userId,
      blocked: false,
    });
    const html = renderToStaticMarkup(
      createElement(PromotionReconciliationSummary, { reconciliation }),
    );
    expect(html).toContain("Verified person found");
    expect(html).toContain("Mira Reyes");
    expect(html).not.toContain("did:example:mira");
  });

  it("blocks cross-person claims and names the records requiring review", () => {
    const reconciliation: AuthAgentPersonReconciliationResponse = {
      state: "cross_person_conflict",
      claims: [
        {
          index: 0,
          type: "did",
          label: "Profile DID",
          state: "verified_match",
          owner: {
            personId: "prsn_mira",
            userId: "usr_mira",
            displayName: "Mira Reyes",
            status: "active",
          },
        },
        {
          index: 1,
          type: "email",
          label: "Contact email",
          state: "verified_match",
          owner: {
            personId: "prsn_jules",
            userId: "usr_jules",
            displayName: "Jules Chen",
            status: "active",
          },
        },
      ],
    };

    expect(
      promotionReconciliationDefaults(reconciliation, user.userId),
    ).toEqual({
      accessPath: "invite",
      userId: user.userId,
      blocked: true,
    });
    const html = renderToStaticMarkup(
      createElement(PromotionReconciliationSummary, { reconciliation }),
    );
    expect(html).toContain("Identity reconciliation required");
    expect(html).toContain("Mira Reyes");
    expect(html).toContain("Jules Chen");
    expect(html).toContain("Profile DID");
    expect(html).toContain("Contact email");
  });

  it("uses canonical auth vocabulary and evidence labels", () => {
    expect(roleLabel("anchor")).toBe("Anchor");
    expect(initials("Mira Reyes")).toBe("MR");
    expect(assuranceLabel(identity)).toBe("Asserted — cannot authenticate");
  });
});
