import { describe, expect, it } from "bun:test";
import {
  AUTH_ADMIN_MUTATION_ACTIONS,
  type AuthAdminMutationAction,
} from "@brains/auth-service/admin-contracts";

interface AdminCapabilityInventoryEntry {
  currentOwner: "admin" | "studio" | "api-only";
  destination: "invitations" | "people" | "peers" | "retirement-decision";
}

/**
 * Frozen before Admin presentation starts moving into Studio. An API-only
 * operation was not rendered by the pre-consolidation Admin app and needs an
 * explicit presentation or retirement decision before `plugins/admin` can go.
 */
const ADMIN_CAPABILITY_INVENTORY: Readonly<
  Record<AuthAdminMutationAction, AdminCapabilityInventoryEntry>
> = {
  cancelInvitation: { currentOwner: "studio", destination: "invitations" },
  confirmManualInvitationDelivery: {
    currentOwner: "studio",
    destination: "invitations",
  },
  createInvitation: { currentOwner: "studio", destination: "invitations" },
  resendInvitation: { currentOwner: "studio", destination: "invitations" },
  updateUserRole: { currentOwner: "admin", destination: "people" },
  updateUserStatus: { currentOwner: "admin", destination: "people" },
  deleteUser: { currentOwner: "admin", destination: "people" },
  revokePasskey: { currentOwner: "admin", destination: "people" },
  startPasskeyRegistration: {
    currentOwner: "admin",
    destination: "people",
  },
  revokeUserSessions: { currentOwner: "admin", destination: "people" },
  createUser: { currentOwner: "api-only", destination: "retirement-decision" },
  inviteExternalPeerPerson: {
    currentOwner: "api-only",
    destination: "peers",
  },
  linkExternalPeer: { currentOwner: "api-only", destination: "peers" },
  attachIdentity: { currentOwner: "api-only", destination: "people" },
  detachIdentity: { currentOwner: "api-only", destination: "people" },
};

const STUDIO_INVITATION_ACTIONS: readonly AuthAdminMutationAction[] = [
  "createInvitation",
  "resendInvitation",
  "cancelInvitation",
  "confirmManualInvitationDelivery",
];

const ADMIN_READ_PRESENTATION: Readonly<
  Record<"audit" | "anchor" | "channels" | "users", string>
> = {
  audit: "studio:audit",
  anchor: "admin:overview",
  channels: "admin:people",
  users: "admin:people",
};

describe("Admin capability parity inventory", () => {
  it("classifies every auth-service administration mutation exactly once", () => {
    expect(Object.keys(ADMIN_CAPABILITY_INVENTORY).sort()).toEqual(
      Object.values(AUTH_ADMIN_MUTATION_ACTIONS).sort(),
    );
    expect(
      Object.values(ADMIN_CAPABILITY_INVENTORY).every(
        (entry) => entry.destination.length > 0,
      ),
    ).toBe(true);
  });

  it("records migrated capabilities as Studio-owned before removing Admin views", () => {
    expect(ADMIN_READ_PRESENTATION.audit).toBe("studio:audit");
    for (const action of STUDIO_INVITATION_ACTIONS) {
      expect(ADMIN_CAPABILITY_INVENTORY[action].currentOwner).toBe("studio");
    }
  });
});
