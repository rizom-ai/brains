import { describe, expect, it } from "bun:test";
import {
  AUTH_ADMIN_MUTATION_ACTIONS,
  type AuthAdminMutationAction,
} from "@brains/auth-service/admin-contracts";

interface AdminCapabilityInventoryEntry {
  currentOwner: "studio" | "retired";
  destination: "invitations" | "people" | "peers" | "retirement-decision";
  controlId?: string | undefined;
}

/** Frozen capability-to-control ownership across the Admin-to-Studio move. */
const ADMIN_CAPABILITY_INVENTORY: Readonly<
  Record<AuthAdminMutationAction, AdminCapabilityInventoryEntry>
> = {
  cancelInvitation: {
    currentOwner: "studio",
    destination: "invitations",
    controlId: "cancel-invitation",
  },
  confirmManualInvitationDelivery: {
    currentOwner: "studio",
    destination: "invitations",
    controlId: "confirm-manual-delivery",
  },
  createInvitation: {
    currentOwner: "studio",
    destination: "invitations",
    controlId: "create-invitation",
  },
  resendInvitation: {
    currentOwner: "studio",
    destination: "invitations",
    controlId: "resend-invitation",
  },
  updateUserRole: {
    currentOwner: "studio",
    destination: "people",
    controlId: "update-person-role",
  },
  updateUserStatus: {
    currentOwner: "studio",
    destination: "people",
    controlId: "update-person-status",
  },
  deleteUser: {
    currentOwner: "studio",
    destination: "people",
    controlId: "delete-person",
  },
  revokePasskey: {
    currentOwner: "studio",
    destination: "people",
    controlId: "revoke-person-passkey",
  },
  startPasskeyRegistration: {
    currentOwner: "studio",
    destination: "people",
    controlId: "start-person-passkey-registration",
  },
  revokeUserSessions: {
    currentOwner: "studio",
    destination: "people",
    controlId: "revoke-person-sessions",
  },
  createUser: {
    currentOwner: "retired",
    destination: "retirement-decision",
  },
  inviteExternalPeerPerson: {
    currentOwner: "studio",
    destination: "peers",
    controlId: "invite-external-peer-person",
  },
  linkExternalPeer: {
    currentOwner: "studio",
    destination: "peers",
    controlId: "link-external-peer",
  },
  attachIdentity: {
    currentOwner: "studio",
    destination: "people",
    controlId: "attach-person-identity",
  },
  detachIdentity: {
    currentOwner: "studio",
    destination: "people",
    controlId: "detach-person-identity",
  },
};

const ADMIN_READ_PRESENTATION: Readonly<
  Record<"audit" | "anchor" | "channels" | "users", string>
> = {
  audit: "admin:audit",
  anchor: "admin:people",
  channels: "admin:people",
  users: "admin:people",
};

describe("Admin capability parity inventory", () => {
  it("classifies every auth-service administration mutation exactly once", () => {
    expect(Object.keys(ADMIN_CAPABILITY_INVENTORY).sort()).toEqual(
      Object.values(AUTH_ADMIN_MUTATION_ACTIONS).sort(),
    );
  });

  it("maps every retained mutation to one unique Studio control", () => {
    const retained = Object.values(ADMIN_CAPABILITY_INVENTORY).filter(
      (entry) => entry.currentOwner === "studio",
    );
    const controlIds = retained.flatMap((entry) =>
      entry.controlId ? [entry.controlId] : [],
    );

    expect(controlIds).toHaveLength(retained.length);
    expect(new Set(controlIds).size).toBe(controlIds.length);
    expect(
      retained.every(
        (entry) =>
          entry.destination === "invitations" ||
          entry.destination === "people" ||
          entry.destination === "peers",
      ),
    ).toBe(true);
    expect(ADMIN_READ_PRESENTATION).toEqual({
      audit: "admin:audit",
      anchor: "admin:people",
      channels: "admin:people",
      users: "admin:people",
    });
  });

  it("records a deliberate retirement for uncredentialed direct user creation", () => {
    expect(ADMIN_CAPABILITY_INVENTORY.createUser).toEqual({
      currentOwner: "retired",
      destination: "retirement-decision",
    });
  });
});
