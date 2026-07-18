import {
  AUTH_ADMIN_MUTATION_ACTIONS,
  AUTH_USER_ROLES,
  type AuthAdminMutation,
  type AuthAdminRole,
  type AuthAdminUserSummary,
} from "@brains/auth-service/admin-contracts";
import type { ReactElement } from "react";
import { assuranceLabel, formatDate, initials, roleLabel } from "../format";
import type { Confirmation } from "../people-types";
import { AccessItem, Button, DetailSection, TextAction } from "./primitives";

export function PersonDetail(props: {
  user: AuthAdminUserSummary | undefined;
  onIdentity: () => void;
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

  const confirmRole = (role: AuthAdminRole): void => {
    if (role === user.role) return;
    props.onConfirm({
      kind: "confirm",
      title: `Change ${user.displayName}’s role?`,
      copy: `${roleLabel(user.role)} → ${roleLabel(role)} changes permissions immediately.`,
      warning:
        role === "anchor"
          ? "Anchor grants full administration and restricted-content access."
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
              {user.personId} · {user.userId} · {roleLabel(user.status)}
            </span>
          </span>
        </div>
        <label className="people-role-control">
          <span>Role</span>
          <select
            value={user.role}
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

      <div className="people-detail-sections">
        <DetailSection
          title="Linked agents"
          description="Representatives sharing this person’s canonical profile and identity claims."
        >
          {user.agents.length === 0 ? (
            <p className="people-empty">
              No external representatives linked. The brain’s built-in agent is
              implicit and does not require a representation link.
            </p>
          ) : (
            user.agents.map((agent) => (
              <AccessItem
                key={agent.agentId}
                kind="Agent"
                value={`${agent.agentId} · ${roleLabel(agent.status)}`}
              />
            ))
          )}
        </DetailSection>

        <DetailSection
          title="Identities"
          description="Ways this person is recognized."
        >
          {user.identities.length === 0 ? (
            <p className="people-empty">No identities attached.</p>
          ) : (
            user.identities.map((identity) => {
              const sources = [
                ...new Set(
                  identity.evidence.map((evidence) =>
                    roleLabel(evidence.sourceKind),
                  ),
                ),
              ];
              const provenance =
                sources.length > 0 ? ` via ${sources.join(", ")}` : "";
              return (
                <AccessItem
                  key={identity.id}
                  kind={roleLabel(identity.type)}
                  value={`${identity.label ?? "Private identity"} · ${assuranceLabel(identity)}${provenance}`}
                  action={
                    <TextAction
                      danger
                      onClick={() =>
                        props.onConfirm({
                          kind: "confirm",
                          title: "Detach this identity?",
                          copy: `${user.displayName} will no longer be recognized through this identity.`,
                          warning:
                            "Any sessions associated with this person will end.",
                          submitLabel: "Detach identity",
                          run: async () => {
                            await props.onMutation(
                              {
                                action:
                                  AUTH_ADMIN_MUTATION_ACTIONS.detachIdentity,
                                confirmation:
                                  AUTH_ADMIN_MUTATION_ACTIONS.detachIdentity,
                                identityId: identity.id,
                              },
                              user.userId,
                            );
                          },
                        })
                      }
                    >
                      Detach
                    </TextAction>
                  }
                />
              );
            })
          )}
          <details className="people-advanced">
            <summary>Advanced identity tools</summary>
            <p>
              Manual claims are unverified and cannot authenticate this person.
              Prefer a verified provider sign-in or passkey whenever possible.
            </p>
            <TextAction onClick={props.onIdentity}>
              Attach unverified identity
            </TextAction>
          </details>
        </DetailSection>

        <DetailSection
          title="Passkeys"
          description="Private authentication credentials."
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
                        warning: `${user.displayName} will need another passkey or identity to sign in.`,
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
            <TextAction
              onClick={() => {
                void props
                  .onMutation({
                    action:
                      AUTH_ADMIN_MUTATION_ACTIONS.startPasskeyRegistration,
                    confirmation:
                      AUTH_ADMIN_MUTATION_ACTIONS.startPasskeyRegistration,
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
              }}
            >
              Create setup link
            </TextAction>
          </div>
        </DetailSection>

        <DetailSection
          title="Sessions"
          description="Current authenticated access."
        >
          <AccessItem
            kind="Authenticated sessions"
            value="Revoke current browser and OAuth access"
            action={
              <TextAction
                danger
                onClick={() =>
                  props.onConfirm({
                    kind: "confirm",
                    title: "Revoke all sessions?",
                    copy: `${user.displayName} will be signed out everywhere.`,
                    warning: "This does not remove passkeys or identities.",
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
      </div>

      <footer className="people-detail-footer">
        <small>
          {user.role === "anchor" && user.status === "active"
            ? "At least one active Anchor must remain."
            : "Access changes are audited."}
        </small>
        <Button
          {...(user.status === "suspended" ? {} : { tone: "danger" as const })}
          onClick={() => {
            const suspended = user.status === "suspended";
            props.onConfirm({
              kind: "confirm",
              title: `${suspended ? "Reactivate" : "Suspend"} ${user.displayName}?`,
              copy: suspended
                ? "Authenticated access will be available again."
                : "Authenticated access will end immediately.",
              warning: suspended
                ? "Existing passkeys and identities remain attached."
                : "Sessions and refresh tokens will be revoked. You can reactivate this person later.",
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
