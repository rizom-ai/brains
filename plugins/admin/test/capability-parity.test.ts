import { describe, expect, it } from "bun:test";
import {
  AUTH_ADMIN_MUTATION_ACTIONS,
  type AuthAdminMutationAction,
} from "@brains/auth-service/admin-contracts";

interface AdminCapabilityInventoryEntry {
  currentOwner: "admin" | "api-only";
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
  cancelInvitation: { currentOwner: "admin", destination: "invitations" },
  confirmManualInvitationDelivery: {
    currentOwner: "admin",
    destination: "invitations",
  },
  createInvitation: { currentOwner: "admin", destination: "invitations" },
  resendInvitation: { currentOwner: "admin", destination: "invitations" },
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

  it("records Audit as Studio-owned before removing its Admin view", () => {
    expect(ADMIN_READ_PRESENTATION.audit).toBe("studio:audit");
  });
});
