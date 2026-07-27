import { describe, expect, it } from "bun:test";
import type {
  AuthAdminUserSummary,
  AuthAuditEventSummary,
  AuthBrainAnchorSummary,
  AuthInvitationChannelSummary,
} from "@brains/auth-service/admin-contracts";
import { QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  PeopleApp,
  buildInvitationMutation,
  initials,
  messageOf,
  roleLabel,
  type PeopleBootstrap,
} from "./App";
import { InvitationsView } from "./components/InvitationsView";
import { PersonDetail } from "./components/PersonDetail";
import {
  AddPersonDialog,
  runSingleSubmission,
} from "./dialogs/AddPersonDialog";
import { runWithFeedback as executeWithFeedback } from "./feedback";
import peopleStyles from "./people.css" with { type: "text" };
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

const channels: AuthInvitationChannelSummary[] = [
  {
    type: "email",
    displayName: "Email",
    subjectLabel: "Email address",
    deliveryModes: ["automatic"],
  },
  {
    type: "discord",
    displayName: "Discord",
    subjectLabel: "Discord user ID",
    deliveryModes: ["manual"],
  },
];

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
  selfUserId = "usr_yeehaa",
): string {
  return renderToStaticMarkup(
    createElement(PersonDetail, {
      user: member,
      brainName: "smoke-rover",
      activeAdminCount,
      channels,
      selfUserId,
      onConfirm: () => undefined,
      onMutation: async () => undefined,
      onSetup: () => undefined,
    }),
  );
}

describe("Admin surface", () => {
  it("builds one atomic idempotent email invitation mutation", () => {
    expect(
      buildInvitationMutation({
        displayName: "Mira",
        role: "trusted",
        delivery: { type: "email", subject: "mira@example.com" },
        idempotencyKey: "request-1",
      }),
    ).toEqual({
      action: "createInvitation",
      confirmation: "createInvitation",
      idempotencyKey: "request-1",
      displayName: "Mira",
      role: "trusted",
      delivery: { type: "email", subject: "mira@example.com" },
    });
  });

  it("coalesces repeated invitation submissions while one is pending", async () => {
    const lock = { current: false };
    let complete: (() => void) | undefined;
    let calls = 0;
    const operation = (): Promise<void> => {
      calls += 1;
      return new Promise((resolve) => {
        complete = resolve;
      });
    };

    const first = runSingleSubmission(lock, operation);
    const duplicate = runSingleSubmission(lock, operation);

    expect(calls).toBe(1);
    expect(await duplicate).toBe(false);
    complete?.();
    expect(await first).toBe(true);
    expect(lock.current).toBe(false);
  });

  it("renders current and completed invitation lifecycle states", () => {
    const html = renderToStaticMarkup(
      createElement(InvitationsView, {
        invitations: [
          {
            ...user,
            status: "invited",
            invitation: {
              id: "inv_sent",
              userId: user.userId,
              state: "sent",
              createdAt: 1,
              updatedAt: 2,
              sentAt: 2,
            },
          },
          {
            ...user,
            userId: "usr_claimed",
            personId: "per_claimed",
            status: "active",
            invitation: {
              id: "inv_claimed",
              userId: "usr_claimed",
              state: "claimed",
              createdAt: 1,
              updatedAt: 3,
              claimedAt: 3,
            },
          },
        ],
        onAdd: () => undefined,
        onCreateSetup: () => undefined,
        onCancel: () => undefined,
      }),
    );

    expect(html).toContain("Sent");
    expect(html).toContain("Claimed");
    expect(html).toContain("Invitation history");
    expect(html).not.toContain("setup not yet claimed");
  });

  it("renders invitation channels from registry metadata", () => {
    const html = renderToStaticMarkup(
      createElement(AddPersonDialog, {
        channels: [
          {
            type: "email",
            displayName: "Email",
            subjectLabel: "Email address",
            deliveryModes: ["automatic"],
          },
          {
            type: "slack",
            displayName: "Slack",
            subjectLabel: "Slack member ID",
            deliveryModes: ["manual"],
          },
        ],
        onClose: () => undefined,
        onCreate: async () => undefined,
      }),
    );

    expect(html).toContain("Delivery channel");
    expect(html).toContain("Email");
    expect(html).toContain("Slack");
    expect(html).toContain("Email address");
    expect(html).not.toContain("Discord display handle");
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
    expect(html).toContain("No verified connected channel");
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
    expect(anchorUser).not.toContain("Change role");
    expect(anchorUser).toContain("Edit in CMS");
  });

  it("points the signed-in admin to /account for their own credentials", () => {
    const self = renderPerson(user, 2, user.userId);

    // Self-service actions live at /account; the admin-grade lockout
    // actions are not offered against your own signed-in row.
    expect(self).toContain('href="/account"');
    expect(self).toContain("Manage at /account");
    expect(self).not.toContain("Revoke</button>");
    expect(self).not.toContain("Revoke all");
    expect(self).not.toContain("Create setup link");

    // Another person's row keeps the full admin actions.
    const other = renderPerson(user, 2, "usr_yeehaa");
    expect(other).toContain("Revoke all");
    expect(other).toContain("Create setup link");
    expect(other).not.toContain('href="/account"');
  });

  it("limits suspended accounts to reactivation or deletion", () => {
    const suspended = renderPerson({
      ...user,
      role: "trusted",
      status: "suspended",
      passkeys: [
        {
          id: "credential-1",
          userId: user.userId,
          credentialBackedUp: true,
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    });

    expect(suspended).toContain("Reactivate person");
    expect(suspended).toContain("Delete person");
    expect(suspended).not.toContain("Change role");
    expect(suspended).not.toContain("Revoke all");
    expect(suspended).not.toContain("Revoke</button>");
    expect(suspended).not.toContain("Create setup link");
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

  it("stacks mutation feedback above the modal layer", () => {
    const zIndexOf = (selector: string): number => {
      const rule = peopleStyles
        .split("}")
        .find((block) => block.includes(`${selector} {`));
      const match = rule?.match(/z-index:\s*(\d+)/);
      if (!match?.[1]) throw new Error(`No z-index found for ${selector}`);
      return Number(match[1]);
    };

    expect(zIndexOf(".people-feedback")).toBeGreaterThan(
      zIndexOf(".people-modal-layer"),
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
