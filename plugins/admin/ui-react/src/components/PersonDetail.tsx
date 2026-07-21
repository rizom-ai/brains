import {
  AUTH_ADMIN_MUTATION_ACTIONS,
  AUTH_USER_ROLES,
  type AuthAdminMutation,
  type AuthAdminRole,
  type AuthAdminUserSummary,
} from "@brains/auth-service/admin-contracts";
import type { ReactElement } from "react";
import { cmsEntityHref, formatDate, initials, roleLabel } from "../format";
import type { Confirmation } from "../people-types";
import { AccessItem, Button, DetailSection, TextAction } from "./primitives";

export function PersonDetail(props: {
  user: AuthAdminUserSummary | undefined;
  brainName: string;
  activeAdminCount: number;
  onConfirm: (confirmation: Confirmation) => void;
  onMutation: (
    mutation: AuthAdminMutation,
    preferredUserId?: string,
  ) => Promise<unknown>;
  onSetup: (setupUrl: string, copy: string) => void;
}): ReactElement {
  const user = props.user;
  if (!user) {
    return (
      <section className="card people-detail">
        <div className="people-detail-empty">
          <p>Select a person to inspect their access.</p>
        </div>
      </section>
    );
  }

  const protectsActiveAdmin =
    user.role === "admin" &&
    user.status === "active" &&
    props.activeAdminCount <= 1;
  const roleProtection = user.isAnchor
    ? "A professional Anchor must remain an active Admin."
    : protectsActiveAdmin
      ? "Add another active Admin before changing this role."
      : undefined;
  const suspensionProtection = user.isAnchor
    ? "The professional Anchor cannot be suspended."
    : protectsActiveAdmin
      ? "Add another active Admin before suspending this person."
      : undefined;
  const connectedChannels = user.identities.filter(
    (identity) =>
      identity.revokedAt === undefined &&
      identity.verifiedAt !== undefined &&
      (identity.type === "email" || identity.type === "discord"),
  );

  const confirmRole = (role: AuthAdminRole): void => {
    if (role === user.role) return;
    props.onConfirm({
      kind: "confirm",
      title: `Change ${user.displayName}’s role?`,
      copy: `${roleLabel(user.role)} → ${roleLabel(role)} changes permissions immediately.`,
      warning:
        role === "admin"
          ? "Admin grants full administration and restricted-content access."
          : "Existing sessions will end and must be reauthenticated.",
      submitLabel: "Change role",
      run: async () => {
        await props.onMutation(
          {
            action: AUTH_ADMIN_MUTATION_ACTIONS.updateUserRole,
            confirmation: AUTH_ADMIN_MUTATION_ACTIONS.updateUserRole,
            userId: user.userId,
            role,
          },
          user.userId,
        );
      },
    });
  };

  const createSetupLink = (): void => {
    void props
      .onMutation({
        action: AUTH_ADMIN_MUTATION_ACTIONS.startPasskeyRegistration,
        confirmation: AUTH_ADMIN_MUTATION_ACTIONS.startPasskeyRegistration,
        userId: user.userId,
      })
      .then((result) => {
        const registration = (
          result as {
            registration: { setupUrl: string; expiresAt: number };
          }
        ).registration;
        props.onSetup(
          registration.setupUrl,
          `Send this single-use link to ${user.displayName} through a private channel. It expires ${formatDate(registration.expiresAt * 1000)}.`,
        );
      })
      .catch(() => undefined);
  };

  return (
    <section className="card people-detail" aria-live="polite">
      <div className="people-detail-identity">
        <div className="people-detail-person">
          <span className="people-avatar people-avatar--large">
            {initials(user.displayName)}
          </span>
          <span>
            <span className="people-detail-name">{user.displayName}</span>
            <span className="people-detail-id">
              {user.isAnchor ? "Professional Anchor · " : ""}
              {roleLabel(user.status)} account
            </span>
          </span>
        </div>
        <div className="people-facets" aria-label="Member facets">
          <div className="people-facet">
            <span>Role</span>
            <strong
              className={`people-facet-role people-facet-role--${user.role}`}
            >
              {roleLabel(user.role)}
            </strong>
          </div>
          <div className="people-facet">
            <span>Anchor</span>
            <strong className={user.isAnchor ? "is-anchor" : "not-anchor"}>
              {user.isAnchor ? "Yes" : "No"}
            </strong>
          </div>
        </div>
      </div>

      <div className="people-detail-sections">
        <DetailSection
          title="Profile"
          description={
            user.profileEntityId
              ? "This brain’s Anchor profile is CMS-owned."
              : user.externalPeers.length > 0
                ? "Published by the linked external brain and read-only here."
                : "Hosted members without an external brain have no profile for now."
          }
        >
          {user.profileEntityId ? (
            <AccessItem
              kind="Anchor profile"
              value={user.displayName}
              action={
                cmsEntityHref(user.profileEntityId) ? (
                  <a
                    className="people-text-action"
                    href={cmsEntityHref(user.profileEntityId)}
                  >
                    Edit in CMS →
                  </a>
                ) : undefined
              }
            />
          ) : user.externalPeers.length > 0 ? (
            <AccessItem
              kind="External profile"
              value={user.externalPeers[0]?.peerId ?? "External brain"}
            />
          ) : (
            <p className="people-empty">No profile · local display name only</p>
          )}
        </DetailSection>

        <DetailSection
          title="Brain"
          description="Local membership and external peer linkage are independent facts."
        >
          <AccessItem
            kind="Local"
            value={`${props.brainName} · member account`}
          />
          {user.externalPeers.length === 0 ? (
            <AccessItem kind="External" value="None linked" />
          ) : (
            user.externalPeers.map((peer) => (
              <AccessItem
                key={peer.peerId}
                kind="External peer"
                value={`${peer.peerId} · ${roleLabel(peer.verificationStatus)}`}
              />
            ))
          )}
        </DetailSection>

        <DetailSection
          title="Access"
          description="Permission role on this brain. Peer linkage never changes it."
        >
          <div className="people-access-role">
            <span>
              <strong>{roleLabel(user.role)}</strong>
              <small>
                {roleProtection ?? `${roleLabel(user.status)} account`}
              </small>
            </span>
            <label className="people-role-control">
              <span>Change role</span>
              <select
                value={user.role}
                disabled={roleProtection !== undefined}
                onChange={(event) =>
                  confirmRole(event.currentTarget.value as AuthAdminRole)
                }
              >
                {AUTH_USER_ROLES.map((role) => (
                  <option key={role} value={role}>
                    {roleLabel(role)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <AccessItem
            kind="Sessions"
            value="Current browser and OAuth access"
            action={
              <TextAction
                danger
                onClick={() =>
                  props.onConfirm({
                    kind: "confirm",
                    title: "Revoke all sessions?",
                    copy: `${user.displayName} will be signed out everywhere.`,
                    warning:
                      "This does not remove passkeys or connected channels.",
                    submitLabel: "Revoke sessions",
                    run: async () => {
                      await props.onMutation({
                        action: AUTH_ADMIN_MUTATION_ACTIONS.revokeUserSessions,
                        confirmation:
                          AUTH_ADMIN_MUTATION_ACTIONS.revokeUserSessions,
                        userId: user.userId,
                      });
                    },
                  })
                }
              >
                Revoke all
              </TextAction>
            }
          />
        </DetailSection>

        <DetailSection
          title="Sign-in"
          description="Passkeys used to access this account."
        >
          {user.passkeys.length === 0 ? (
            <p className="people-empty">No passkeys registered.</p>
          ) : (
            user.passkeys.map((passkey) => (
              <AccessItem
                key={passkey.id}
                kind="Passkey"
                value={`${passkey.credentialDeviceType ? roleLabel(passkey.credentialDeviceType) : "Passkey"} · added ${formatDate(passkey.createdAt)}`}
                action={
                  <TextAction
                    danger
                    onClick={() =>
                      props.onConfirm({
                        kind: "confirm",
                        title: "Revoke this passkey?",
                        copy: "This passkey will stop working immediately.",
                        warning: `${user.displayName} will need another passkey to sign in.`,
                        submitLabel: "Revoke passkey",
                        run: async () => {
                          await props.onMutation(
                            {
                              action: AUTH_ADMIN_MUTATION_ACTIONS.revokePasskey,
                              confirmation:
                                AUTH_ADMIN_MUTATION_ACTIONS.revokePasskey,
                              credentialId: passkey.id,
                            },
                            user.userId,
                          );
                        },
                      })
                    }
                  >
                    Revoke
                  </TextAction>
                }
              />
            ))
          )}
          <div className="people-inline-actions">
            <TextAction onClick={createSetupLink}>Create setup link</TextAction>
          </div>
        </DetailSection>

        <DetailSection
          title="Connected channels"
          description="Verified human-facing channels connected to this account."
        >
          {connectedChannels.length === 0 ? (
            <p className="people-empty">
              No verified email or Discord channel.
            </p>
          ) : (
            connectedChannels.map((identity) => (
              <AccessItem
                key={identity.id}
                kind={roleLabel(identity.type)}
                value={`${identity.label ?? "Verified channel"} · verified`}
              />
            ))
          )}
        </DetailSection>
      </div>

      <footer className="people-detail-footer">
        <small>
          {suspensionProtection ?? "Account access changes are audited."}
        </small>
        <Button
          {...(user.status === "suspended" ? {} : { tone: "danger" as const })}
          disabled={
            user.status !== "suspended" && suspensionProtection !== undefined
          }
          onClick={() => {
            const suspended = user.status === "suspended";
            props.onConfirm({
              kind: "confirm",
              title: `${suspended ? "Reactivate" : "Suspend"} ${user.displayName}?`,
              copy: suspended
                ? "Authenticated access will be available again."
                : "Every connected channel and session will be denied immediately.",
              warning: suspended
                ? "Existing passkeys and channels remain attached."
                : "Sessions and refresh tokens will be revoked.",
              submitLabel: suspended ? "Reactivate person" : "Suspend person",
              run: async () => {
                await props.onMutation(
                  {
                    action: AUTH_ADMIN_MUTATION_ACTIONS.updateUserStatus,
                    confirmation: AUTH_ADMIN_MUTATION_ACTIONS.updateUserStatus,
                    userId: user.userId,
                    status: suspended ? "active" : "suspended",
                  },
                  user.userId,
                );
              },
            });
          }}
        >
          {user.status === "suspended" ? "Reactivate person" : "Suspend person"}
        </Button>
      </footer>
    </section>
  );
}
