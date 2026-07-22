import type {
  AuthIdentityProposalInput,
  AuthIdentityReconciliationResponse,
} from "./admin-contracts";
import {
  hashIdentityKey,
  normalizeIdentityKey,
  type AuthIdentityStore,
} from "./identity-store";
import type { AuthUserStore } from "./user-store";

export interface IdentityReconciliationServiceOptions {
  identities: AuthIdentityStore;
  users: AuthUserStore;
}

export class IdentityReconciliationService {
  private readonly identities: AuthIdentityStore;
  private readonly users: AuthUserStore;

  constructor(options: IdentityReconciliationServiceOptions) {
    this.identities = options.identities;
    this.users = options.users;
  }

  async reconcile(
    claims: AuthIdentityProposalInput[],
  ): Promise<AuthIdentityReconciliationResponse> {
    const [identities, users] = await Promise.all([
      this.identities.listAllIdentities(),
      this.users.listUsers(),
    ]);
    const activeIdentityByHash = new Map(
      identities
        .filter((identity) => identity.revokedAt === null)
        .map((identity) => [identity.identityKeyHash, identity]),
    );
    const userByPersonId = new Map(users.map((user) => [user.personId, user]));

    const reconciledClaims: AuthIdentityReconciliationResponse["claims"] =
      claims.map((claim, index) => {
        const identityKeyHash = hashIdentityKey(
          normalizeIdentityKey({
            type: claim.type,
            subject: claim.subject,
            ...(claim.issuer ? { issuer: claim.issuer } : {}),
          }),
        );
        const identity = activeIdentityByHash.get(identityKeyHash);
        if (!identity) {
          return {
            index,
            type: claim.type,
            ...(claim.label ? { label: claim.label } : {}),
            state: "unbound" as const,
          };
        }

        const user = userByPersonId.get(identity.personId);
        const verified = identity.evidence.some(
          (evidence) =>
            evidence.assurance === "verified" && evidence.verifiedAt !== null,
        );
        return {
          index,
          type: claim.type,
          ...(claim.label ? { label: claim.label } : {}),
          state: verified
            ? ("verified_match" as const)
            : ("asserted_match" as const),
          owner: {
            personId: identity.personId,
            ...(user
              ? {
                  userId: user.id,
                  displayName: user.displayName,
                  status: user.status,
                }
              : {}),
          },
        };
      });

    const matchedPersonIds = new Set(
      reconciledClaims.flatMap((claim) =>
        claim.owner ? [claim.owner.personId] : [],
      ),
    );
    if (matchedPersonIds.size > 1) {
      return { state: "cross_person_conflict", claims: reconciledClaims };
    }

    const verifiedMatch = reconciledClaims.find(
      (claim) => claim.state === "verified_match" && claim.owner?.userId,
    );
    if (matchedPersonIds.size === 1 && verifiedMatch?.owner?.userId) {
      return {
        state: "unique_verified_match",
        suggestedUserId: verifiedMatch.owner.userId,
        claims: reconciledClaims,
      };
    }

    return { state: "no_verified_match", claims: reconciledClaims };
  }
}
