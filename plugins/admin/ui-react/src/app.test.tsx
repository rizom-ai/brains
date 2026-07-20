import { describe, expect, it } from "bun:test";
import { QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  PeopleApp,
  PromotionReconciliationSummary,
  assuranceLabel,
  initials,
  manualIdentityTypes,
  messageOf,
  promotionReconciliationDefaults,
  roleLabel,
  type PeopleBootstrap,
} from "./App";
import { runWithFeedback as executeWithFeedback } from "./feedback";
import { createAdminQueryClient } from "./query-client";
import type {
  AuthAdminUserSummary,
  AuthAgentPersonReconciliationResponse,
  AuthBrainAnchorSummary,
} from "@brains/auth-service/admin-contracts";

const admin: PeopleBootstrap = {
  userId: "usr_yeehaa",
  displayName: "Yeehaa",
  role: "admin",
  isAnchor: true,
  brainName: "smoke-rover",
  routePath: "/admin",
};

const brainAnchor: AuthBrainAnchorSummary = {
  kind: "person",
  configuredKind: "person",
  subjectId: "per_yeehaa",
  displayName: "Yeehaa Morgan",
  personId: "per_yeehaa",
  profileEntityId: "anchor-profile/anchor-profile",
  administeredBy: 2,
};

const user: AuthAdminUserSummary = {
  userId: "usr_mira",
  personId: "per_mira",
  displayName: "Mira Reyes",
  role: "admin",
  status: "active",
  permissionLevel: "admin",
  isAnchor: false,
  profileEntityId: "person-profile/mira-reyes",
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

function renderPeople(props: Parameters<typeof PeopleApp>[0]): string {
  const queryClient = createAdminQueryClient();
  return renderToStaticMarkup(
    createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(PeopleApp, props),
    ),
  );
}

describe("People surface", () => {
  it("renders the anchor and member model without dashboard markup", () => {
    const html = renderPeople({
      bootstrap: admin,
      initialAnchor: brainAnchor,
      initialUsers: [user],
    });

    expect(html).toContain("Admin");
    expect(html).toContain("Anchor");
    expect(html).toContain("person");
    expect(html).toContain("Members");
    expect(html).toContain("smoke-rover");
    expect(html).toContain("1 member · 1 admin");
    expect(html).toContain("Mira Reyes");
    expect(html).toContain("Brain");
    expect(html).toContain("smoke-rover · hosted member");
    expect(html).toContain("No verified external brain linked");
    expect(html).toContain("Anchor?");
    expect(html).toContain("No");
    expect(html).toContain("Asserted — cannot authenticate");
    expect(html).toContain("Add member");
    expect(html).toContain("kind: person · brain.yaml");
    expect(html).toContain("Edit in CMS");
    expect(html).toContain("/cms#/person-profile/mira-reyes");
    expect(html).toContain("Yeehaa Morgan");
    expect(html).not.toContain("Save Anchor");
    expect(html).not.toContain("anchor-kind-toggle");
    expect(html).not.toContain("dashboard-tab-panel");
  });

  it("uses team and organization vocabulary without changing collective mechanics", () => {
    const { personId: _personId, ...collectiveAnchor } = brainAnchor;
    const teamHtml = renderPeople({
      bootstrap: { ...admin, isAnchor: false },
      initialAnchor: {
        ...collectiveAnchor,
        kind: "collective",
        configuredKind: "team",
        subjectId: "coll_team",
        displayName: "The Peppers",
      },
      initialUsers: [user],
    });
    const organizationHtml = renderPeople({
      bootstrap: { ...admin, isAnchor: false },
      initialAnchor: {
        ...collectiveAnchor,
        kind: "collective",
        configuredKind: "organization",
        subjectId: "coll_org",
        displayName: "Rizom",
      },
      initialUsers: [user],
    });

    expect(teamHtml).toContain("members · anchor · access");
    expect(teamHtml).toContain("Add member");
    expect(teamHtml).toContain("run together");
    expect(organizationHtml).toContain("people · anchor · access");
    expect(organizationHtml).toContain("Add person");
    expect(organizationHtml).toContain("administered on its behalf");
  });

  it("disables impossible last-Admin role and status changes", () => {
    const html = renderPeople({
      bootstrap: admin,
      initialAnchor: brainAnchor,
      initialUsers: [user],
    });

    expect(html).toContain(
      "Add another active Admin before changing this role.",
    );
    expect(html).toContain(
      "Add another active Admin before suspending this person.",
    );
    expect(html.match(/disabled=""/g)).toHaveLength(2);
  });

  it("keeps a personal Anchor active and Admin even when another Admin exists", () => {
    const anchorUser: AuthAdminUserSummary = {
      ...user,
      userId: admin.userId,
      personId: brainAnchor.personId ?? "per_yeehaa",
      displayName: brainAnchor.displayName,
      isAnchor: true,
    };
    const html = renderPeople({
      bootstrap: admin,
      initialAnchor: brainAnchor,
      initialUsers: [anchorUser, user],
    });

    expect(html).toContain("A personal Anchor must remain an active Admin.");
    expect(html).toContain("The personal Anchor cannot be suspended.");
  });

  it("explains that linked agents are external representatives", () => {
    const html = renderPeople({
      bootstrap: admin,
      initialAnchor: brainAnchor,
      initialUsers: [{ ...user, agents: [] }],
    });

    expect(html).toContain("No external representatives linked");
    expect(html).toContain("built-in agent is");
  });

  it("demotes manual identity attachment behind an advanced warning", () => {
    const html = renderPeople({
      bootstrap: admin,
      initialAnchor: brainAnchor,
      initialUsers: [user],
    });

    expect(html).toContain("Advanced identity tools");
    expect(html).toContain("Attach unverified identity");
    expect(html).toContain("cannot authenticate this person");
  });

  it("filters manual identity types to human-facing configured providers", () => {
    expect(manualIdentityTypes(["discord", "mcp", "a2a"])).toEqual([
      "oauth",
      "discord",
    ]);
    expect(manualIdentityTypes(["email-resend"])).toEqual(["oauth", "email"]);
  });

  it("shows only self-service representation consent to non-Admins", () => {
    const html = renderPeople({
      bootstrap: {
        ...admin,
        displayName: "Mira",
        role: "trusted",
        isAnchor: false,
      },
      initialRepresentations: [representation],
    });

    expect(html).toContain("My agents");
    expect(html).not.toContain("Access roster");
    expect(html).not.toContain("Add member");
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
    expect(roleLabel("admin")).toBe("Admin");
    expect(initials("Mira Reyes")).toBe("MR");
    expect(assuranceLabel(identity)).toBe("Asserted — cannot authenticate");
  });

  it("uses safe mutation feedback fallbacks", () => {
    expect(messageOf(new Error("Consent denied"), "Consent failed")).toBe(
      "Consent denied",
    );
    expect(messageOf({ secret: "private" }, "Consent failed")).toBe(
      "Consent failed",
    );
  });

  it("centralizes successful and failed mutation feedback", async () => {
    const feedback: { message: string; tone: "good" | "error" }[] = [];
    const result = await executeWithFeedback(
      async () => "done",
      (entry) => feedback.push(entry),
      { success: "Updated", fallback: "Update failed" },
    );
    expect(result).toBe("done");
    expect(feedback).toEqual([{ message: "Updated", tone: "good" }]);

    let thrown: unknown;
    try {
      await executeWithFeedback(
        async () => {
          throw { secret: "private" };
        },
        (entry) => feedback.push(entry),
        { fallback: "Update failed" },
      );
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toEqual({ secret: "private" });
    expect(feedback.at(-1)).toEqual({
      message: "Update failed",
      tone: "error",
    });
  });
});
