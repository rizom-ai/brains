import { describe, expect, it } from "bun:test";
import type {
  AuthAdminUserSummary,
  AuthAuditEventSummary,
  AuthBrainAnchorSummary,
} from "@brains/auth-service/admin-contracts";
import { QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  PeopleApp,
  initials,
  messageOf,
  roleLabel,
  type PeopleBootstrap,
} from "./App";
import { PersonDetail } from "./components/PersonDetail";
import { AddPersonDialog } from "./dialogs/AddPersonDialog";
import { runWithFeedback as executeWithFeedback } from "./feedback";
import { createAdminQueryClient } from "./query-client";

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
  identities: [
    {
      id: "idn_discord",
      personId: "per_mira",
      userId: "usr_mira",
      type: "discord",
      visibility: "private",
      label: "@mira",
      verifiedAt: 2,
      createdAt: 1,
      evidence: [
        {
          sourceKind: "provider",
          assurance: "verified",
          verifiedAt: 2,
        },
      ],
    },
  ],
  passkeys: [],
  externalPeers: [
    {
      peerId: "did:web:mira.example",
      personId: "per_mira",
      verificationStatus: "verified",
      createdByUserId: "usr_yeehaa",
      createdAt: 1,
      updatedAt: 1,
    },
  ],
};

const audit: AuthAuditEventSummary[] = [
  {
    id: "aae_1",
    actorUserId: admin.userId,
    action: "auth.external_peer.linked",
    targetType: "external_peer",
    targetId: "did:web:mira.example",
    createdAt: 2,
  },
];

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

function renderPerson(
  member: AuthAdminUserSummary,
  activeAdminCount = 2,
): string {
  return renderToStaticMarkup(
    createElement(PersonDetail, {
      user: member,
      brainName: "smoke-rover",
      activeAdminCount,
      onConfirm: () => undefined,
      onMutation: async () => undefined,
      onSetup: () => undefined,
    }),
  );
}

describe("Admin surface", () => {
  it("requires an explicit email or Discord delivery channel for invitations", () => {
    const html = renderToStaticMarkup(
      createElement(AddPersonDialog, {
        onClose: () => undefined,
        onCreate: async () => undefined,
      }),
    );

    expect(html).toContain("Delivery channel");
    expect(html).toContain("Email");
    expect(html).toContain("Discord");
    expect(html).toContain("Email address or Discord user ID");
    expect(html).toContain("Discord display handle");
  });

  it("renders the four permanent sections and Overview Anchor summary", () => {
    const html = renderPeople({
      bootstrap: admin,
      initialAnchor: brainAnchor,
      initialUsers: [user],
      initialAudit: audit,
    });

    expect(html).toContain("Overview");
    expect(html).toContain("Members");
    expect(html).toContain("Invitations");
    expect(html).toContain("Audit");
    expect(html).toContain("Yeehaa Morgan");
    expect(html).toContain("Active members");
    expect(html).not.toContain("Standalone access");
    expect(html).not.toContain("Operations room");
    expect(html).not.toContain("Subject is hashed and never shown again");
    expect(html).not.toContain("principalKeyHash");
    expect(html).not.toContain("My agents");
    expect(html).not.toContain("Representatives");
  });

  it("uses People vocabulary only for collective organizations", () => {
    const { personId: _personId, ...collectiveAnchor } = brainAnchor;
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
      initialAudit: [],
    });

    expect(organizationHtml).toContain("People");
    expect(organizationHtml).toContain("people · invitations · audit");
  });

  it("shows peer linkage separately from local access", () => {
    const html = renderPerson(user);

    expect(html).toContain(
      "Local membership and external peer linkage are independent",
    );
    expect(html).toContain("did:web:mira.example");
    expect(html).toContain("Permission role on this brain");
    expect(html).toContain("Connected channels");
    expect(html).toContain("@mira · verified");
    expect(html).toContain("Sign-in");
    expect(html).not.toContain("Advanced");
    expect(html).not.toContain("per_mira");
    expect(html).not.toContain("usr_mira");
  });

  it("shows no local profile for hosted members without a peer", () => {
    const html = renderPerson({
      ...user,
      identities: [],
      externalPeers: [],
    });

    expect(html).toContain("No profile · local display name only");
    expect(html).toContain("No verified email or Discord channel");
  });

  it("protects the last active Admin and professional Anchor", () => {
    const lastAdmin = renderPerson(user, 1);
    const anchorUser = renderPerson(
      {
        ...user,
        userId: admin.userId,
        personId: brainAnchor.personId ?? "per_yeehaa",
        displayName: brainAnchor.displayName,
        isAnchor: true,
        ...(brainAnchor.profileEntityId
          ? { profileEntityId: brainAnchor.profileEntityId }
          : {}),
      },
      2,
    );

    expect(lastAdmin).toContain(
      "Add another active Admin before changing this role.",
    );
    expect(lastAdmin).toContain(
      "Add another active Admin before suspending this person.",
    );
    expect(anchorUser).toContain(
      "A professional Anchor must remain an active Admin.",
    );
    expect(anchorUser).toContain(
      "The professional Anchor cannot be suspended.",
    );
    expect(anchorUser).toContain("Edit in CMS");
  });

  it("does not expose administration to non-Admins", () => {
    const html = renderPeople({
      bootstrap: { ...admin, role: "trusted", isAnchor: false },
    });

    expect(html).toContain("Admin access required");
    expect(html).not.toContain("Resolving private records");
  });

  it("uses canonical role formatting and safe feedback fallbacks", () => {
    expect(roleLabel("admin")).toBe("Admin");
    expect(initials("Mira Reyes")).toBe("MR");
    expect(messageOf(new Error("Access denied"), "Mutation failed")).toBe(
      "Access denied",
    );
    expect(messageOf({ secret: "private" }, "Mutation failed")).toBe(
      "Mutation failed",
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
          throw new Error("Denied");
        },
        (entry) => feedback.push(entry),
        { fallback: "Update failed" },
      );
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toEqual(new Error("Denied"));
    expect(feedback.at(-1)).toEqual({ message: "Denied", tone: "error" });
  });
});
