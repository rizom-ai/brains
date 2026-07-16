import {
  AUTH_ADMIN_IDENTITY_TYPES,
  AUTH_ADMIN_MUTATION_ACTIONS,
  AUTH_USER_ROLES,
  type AgentPersonClaimInput,
  type AuthAdminIdentityType,
  type AuthAdminMutation,
  type AuthAdminRole,
  type AuthAdminUserSummary,
  type AuthAgentPersonSummary,
  type AuthIdentitySummary,
} from "@brains/auth-service/admin-contracts";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactElement,
  type ReactNode,
} from "react";
import {
  acceptRepresentation,
  fetchRepresentations,
  fetchUsers,
  mutateAdmin,
} from "./api";
import styles from "./people.css" with { type: "text" };

export interface PeopleBootstrap {
  displayName: string;
  role: AuthAdminRole;
  routePath: string;
}

export interface PeopleAppProps {
  bootstrap: PeopleBootstrap;
  initialUsers?: AuthAdminUserSummary[];
  initialRepresentations?: AuthAgentPersonSummary[];
}

interface AgentPromotionDraft {
  agentId: string;
  displayName?: string;
  claims?: AgentPersonClaimInput[];
}

interface Confirmation {
  kind: "confirm";
  title: string;
  copy: string;
  warning: string;
  submitLabel: string;
  run: () => Promise<void>;
}

type Modal =
  | { kind: "add" }
  | { kind: "identity" }
  | { kind: "promotion"; draft: AgentPromotionDraft }
  | {
      kind: "setup";
      setupUrl: string;
      copy: string;
    }
  | Confirmation
  | null;

type SurfaceView = "roster" | "representations";
type Feedback = { message: string; tone: "good" | "error" } | null;

const PROMOTION_STORAGE_KEY = "brains:people-agent-promotion";

export function roleLabel(value: string): string {
  return value.length === 0
    ? value
    : `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}

export function initials(displayName: string): string {
  return displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.slice(0, 1).toUpperCase())
    .join("");
}

export function assuranceLabel(identity: AuthIdentitySummary): string {
  return identity.evidence.some(
    (evidence) =>
      evidence.assurance === "verified" && evidence.verifiedAt !== undefined,
  )
    ? "Verified"
    : "Asserted — cannot authenticate";
}

function formatDate(value: number): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(
    new Date(value),
  );
}

function Button(props: {
  children: ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
  tone?: "primary" | "danger";
  disabled?: boolean;
}): ReactElement {
  const className = [
    "people-button",
    props.tone ? `people-button--${props.tone}` : "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <button
      className={className}
      type={props.type ?? "button"}
      onClick={props.onClick}
      disabled={props.disabled}
    >
      {props.children}
    </button>
  );
}

function TextAction(props: {
  children: ReactNode;
  onClick: () => void;
  danger?: boolean;
}): ReactElement {
  return (
    <button
      className={`people-text-action${props.danger ? " people-text-action--danger" : ""}`}
      type="button"
      onClick={props.onClick}
    >
      {props.children}
    </button>
  );
}

function AccessItem(props: {
  kind: string;
  value: string;
  action?: ReactNode;
}): ReactElement {
  return (
    <div className="people-access-item">
      <div>
        <div className="people-access-kind">{props.kind}</div>
        <div className="people-access-value">{props.value}</div>
      </div>
      {props.action}
    </div>
  );
}

function DetailSection(props: {
  title: string;
  description: string;
  children: ReactNode;
}): ReactElement {
  return (
    <section className="people-detail-section">
      <div className="people-section-label">
        <h3>{props.title}</h3>
        <p>{props.description}</p>
      </div>
      <div className="people-stack">{props.children}</div>
    </section>
  );
}

function Roster(props: {
  users: AuthAdminUserSummary[];
  selectedUserId: string | undefined;
  onSelect: (userId: string) => void;
}): ReactElement {
  return (
    <section className="card people-roster" aria-label="People list">
      <header className="people-card-head">
        <span className="people-card-title">Access roster</span>
        <span className="people-count">
          {props.users.length} {props.users.length === 1 ? "person" : "people"}
        </span>
      </header>
      <div className="people-list" aria-live="polite">
        {props.users.length === 0 ? (
          <p className="people-empty">No people have been added.</p>
        ) : (
          props.users.map((user) => {
            const agentCount = user.agents.filter(
              (agent) => agent.status !== "revoked",
            ).length;
            const selected = user.userId === props.selectedUserId;
            return (
              <button
                key={user.userId}
                className={`people-row${selected ? " is-selected" : ""}`}
                type="button"
                aria-current={selected}
                onClick={() => props.onSelect(user.userId)}
              >
                <span className="people-avatar">
                  {initials(user.displayName)}
                </span>
                <span className="people-row-identity">
                  <span className="people-row-name">{user.displayName}</span>
                  <span className="people-row-meta">
                    {agentCount} linked {agentCount === 1 ? "agent" : "agents"}
                    {" · "}
                    {user.identities.length} identities
                  </span>
                </span>
                <span className="people-row-access">
                  <span className={`people-role people-role--${user.role}`}>
                    {roleLabel(user.role)}
                  </span>
                  <span
                    className={`people-status people-status--${user.status}`}
                  >
                    {roleLabel(user.status)}
                  </span>
                </span>
              </button>
            );
          })
        )}
      </div>
    </section>
  );
}

function PersonDetail(props: {
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
              No linked agents. Promotion begins from an agent dossier.
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
          <div className="people-inline-actions">
            <TextAction onClick={props.onIdentity}>Attach identity</TextAction>
          </div>
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

function RepresentationsView(props: {
  representations: AuthAgentPersonSummary[];
  onAccept: (agentId: string) => Promise<void>;
}): ReactElement {
  return (
    <section className="people-panel">
      <header className="people-head">
        <div>
          <div className="eyebrow">Your consent</div>
          <h2>My agents</h2>
          <p>
            Review agents that represent your person. Pending links remain
            inactive until you approve them.
          </p>
        </div>
      </header>
      <div className="card people-roster">
        {props.representations.length === 0 ? (
          <p className="people-empty">No agents are linked to your person.</p>
        ) : (
          <div className="people-list">
            {props.representations.map((representation) => (
              <AccessItem
                key={representation.agentId}
                kind="Agent"
                value={`${representation.agentId} · ${roleLabel(representation.status)}`}
                action={
                  representation.status === "pending" ? (
                    <Button
                      tone="primary"
                      onClick={() =>
                        void props.onAccept(representation.agentId)
                      }
                    >
                      Accept
                    </Button>
                  ) : undefined
                }
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function ModalFrame(props: {
  eyebrow: string;
  title: string;
  copy: string;
  children: ReactNode;
  footer: ReactNode;
  onClose: () => void;
  onSubmit?: (event: FormEvent<HTMLFormElement>) => void;
}): ReactElement {
  return (
    <div className="people-modal-layer" role="presentation">
      <dialog className="people-dialog" open aria-modal="true">
        <form
          onSubmit={props.onSubmit}
          onReset={(event) => {
            event.preventDefault();
            props.onClose();
          }}
        >
          <header>
            <div className="eyebrow">{props.eyebrow}</div>
            <h3>{props.title}</h3>
            <p>{props.copy}</p>
          </header>
          <div className="people-dialog-body">{props.children}</div>
          <footer>{props.footer}</footer>
        </form>
      </dialog>
    </div>
  );
}

function AddPersonDialog(props: {
  onClose: () => void;
  onCreate: (displayName: string, role: AuthAdminRole) => Promise<void>;
}): ReactElement {
  return (
    <ModalFrame
      eyebrow="New access"
      title="Add a person"
      copy="Create access first; attach an identity or passkey next."
      onClose={props.onClose}
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        void props.onCreate(
          String(data.get("displayName") ?? ""),
          String(data.get("role") ?? "trusted") as AuthAdminRole,
        );
      }}
      footer={
        <>
          <Button type="button" onClick={props.onClose}>
            Cancel
          </Button>
          <Button type="submit" tone="primary">
            Create person
          </Button>
        </>
      }
    >
      <label>
        <span>Display name</span>
        <input name="displayName" maxLength={200} required autoFocus />
      </label>
      <label>
        <span>Initial role</span>
        <select name="role" defaultValue="trusted">
          {AUTH_USER_ROLES.map((role) => (
            <option key={role} value={role}>
              {roleLabel(role)}
            </option>
          ))}
        </select>
      </label>
      <p className="people-warning">
        Adding an Anchor grants full administration and restricted-content
        access.
      </p>
    </ModalFrame>
  );
}

function IdentityDialog(props: {
  onClose: () => void;
  onAttach: (input: {
    type: Exclude<AuthAdminIdentityType, "passkey">;
    subject: string;
    issuer?: string;
    label?: string;
  }) => Promise<void>;
}): ReactElement {
  return (
    <ModalFrame
      eyebrow="Recognition"
      title="Attach identity"
      copy="Connect a verified provider identity to this person."
      onClose={props.onClose}
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        const issuer = String(data.get("issuer") ?? "").trim();
        const label = String(data.get("label") ?? "").trim();
        void props.onAttach({
          type: String(data.get("type")) as Exclude<
            AuthAdminIdentityType,
            "passkey"
          >,
          subject: String(data.get("subject") ?? ""),
          ...(issuer ? { issuer } : {}),
          ...(label ? { label } : {}),
        });
      }}
      footer={
        <>
          <Button type="button" onClick={props.onClose}>
            Cancel
          </Button>
          <Button type="submit" tone="primary">
            Attach identity
          </Button>
        </>
      }
    >
      <label>
        <span>Identity type</span>
        <select name="type" defaultValue="email">
          {AUTH_ADMIN_IDENTITY_TYPES.map((type) => (
            <option key={type} value={type}>
              {roleLabel(type)}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>Provider subject</span>
        <input name="subject" maxLength={2000} required autoFocus />
      </label>
      <label>
        <span>Issuer (optional)</span>
        <input name="issuer" maxLength={2000} />
      </label>
      <label>
        <span>Safe display label (optional)</span>
        <input name="label" maxLength={200} />
      </label>
      <p className="people-warning">
        Provider subjects remain private in auth storage and are never shown in
        this console.
      </p>
    </ModalFrame>
  );
}

function PromotionDialog(props: {
  draft: AgentPromotionDraft;
  users: AuthAdminUserSummary[];
  selectedUserId: string | undefined;
  onClose: () => void;
  onPromote: (input: {
    accessPath: "invite" | "link";
    displayName: string;
    role: AuthAdminRole;
    userId?: string;
  }) => Promise<void>;
}): ReactElement {
  const [accessPath, setAccessPath] = useState<"invite" | "link">("invite");
  return (
    <ModalFrame
      eyebrow="Agent → user promotion"
      title="Grant represented person access"
      copy="Invite a new person or connect this agent to an existing person."
      onClose={props.onClose}
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        void props.onPromote({
          accessPath,
          displayName: String(data.get("displayName") ?? ""),
          role: String(data.get("role") ?? "trusted") as AuthAdminRole,
          ...(accessPath === "link"
            ? { userId: String(data.get("userId") ?? "") }
            : {}),
        });
      }}
      footer={
        <>
          <Button type="button" onClick={props.onClose}>
            Cancel
          </Button>
          <Button type="submit" tone="primary">
            Continue
          </Button>
        </>
      }
    >
      <label>
        <span>Agent</span>
        <input
          value={props.draft.displayName ?? props.draft.agentId}
          readOnly
        />
      </label>
      <label>
        <span>Access path</span>
        <select
          value={accessPath}
          onChange={(event) =>
            setAccessPath(event.currentTarget.value as "invite" | "link")
          }
        >
          <option value="invite">Invite a new person</option>
          <option value="link">Link an existing person</option>
        </select>
      </label>
      {accessPath === "invite" ? (
        <>
          <label>
            <span>Represented person</span>
            <input
              name="displayName"
              maxLength={200}
              defaultValue={props.draft.displayName ?? ""}
              required
            />
          </label>
          <label>
            <span>Initial role</span>
            <select name="role" defaultValue="trusted">
              {AUTH_USER_ROLES.map((role) => (
                <option key={role} value={role}>
                  {roleLabel(role)}
                </option>
              ))}
            </select>
          </label>
        </>
      ) : (
        <label>
          <span>Existing person</span>
          <select name="userId" defaultValue={props.selectedUserId} required>
            {props.users.map((user) => (
              <option key={user.userId} value={user.userId}>
                {user.displayName} · {roleLabel(user.role)} ·{" "}
                {roleLabel(user.status)}
              </option>
            ))}
          </select>
        </label>
      )}
      {(props.draft.claims?.length ?? 0) > 0 && (
        <p className="people-note">
          {props.draft.claims?.length} agent-carried identity{" "}
          {props.draft.claims?.length === 1 ? "assertion" : "assertions"} will
          be retained for review.
        </p>
      )}
      <p className="people-warning">
        Agent assertions never authenticate a person. New access requires a
        passkey; existing-person links require that person’s consent.
      </p>
    </ModalFrame>
  );
}

export function PeopleApp(props: PeopleAppProps): ReactElement {
  const isAnchor = props.bootstrap.role === "anchor";
  const [users, setUsers] = useState<AuthAdminUserSummary[]>(
    props.initialUsers ?? [],
  );
  const [representations, setRepresentations] = useState<
    AuthAgentPersonSummary[]
  >(props.initialRepresentations ?? []);
  const [selectedUserId, setSelectedUserId] = useState<string | undefined>(
    props.initialUsers?.[0]?.userId,
  );
  const [view, setView] = useState<SurfaceView>(
    isAnchor ? "roster" : "representations",
  );
  const [loading, setLoading] = useState(
    props.initialUsers === undefined &&
      props.initialRepresentations === undefined,
  );
  const [modal, setModal] = useState<Modal>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedUser = useMemo(
    () => users.find((user) => user.userId === selectedUserId),
    [selectedUserId, users],
  );

  const loadUsers = useCallback(
    async (preferredUserId?: string): Promise<void> => {
      const response = await fetchUsers();
      setUsers(response.users);
      setSelectedUserId((current) => {
        const candidate = preferredUserId ?? current;
        return response.users.some((user) => user.userId === candidate)
          ? candidate
          : response.users[0]?.userId;
      });
    },
    [],
  );

  const loadRepresentations = useCallback(async (): Promise<void> => {
    const response = await fetchRepresentations();
    setRepresentations(response.representations);
  }, []);

  useEffect(() => {
    if (
      props.initialUsers !== undefined ||
      props.initialRepresentations !== undefined
    )
      return;
    void Promise.all([
      isAnchor ? loadUsers() : Promise.resolve(),
      loadRepresentations(),
    ])
      .catch((loadError: unknown) =>
        setError(
          loadError instanceof Error ? loadError.message : "People unavailable",
        ),
      )
      .finally(() => setLoading(false));
  }, [
    isAnchor,
    loadRepresentations,
    loadUsers,
    props.initialRepresentations,
    props.initialUsers,
  ]);

  useEffect(() => {
    if (!isAnchor || typeof window === "undefined") return;
    const raw = window.sessionStorage.getItem(PROMOTION_STORAGE_KEY);
    if (!raw) return;
    window.sessionStorage.removeItem(PROMOTION_STORAGE_KEY);
    try {
      const draft = JSON.parse(raw) as AgentPromotionDraft;
      if (typeof draft.agentId === "string" && draft.agentId.length > 0) {
        setModal({ kind: "promotion", draft });
      }
    } catch {
      setFeedback({
        message: "The agent promotion request was invalid.",
        tone: "error",
      });
    }
  }, [isAnchor]);

  const runMutation = useCallback(
    async (
      mutation: AuthAdminMutation,
      preferredUserId?: string,
    ): Promise<unknown> => {
      try {
        const result = await mutateAdmin<unknown>(mutation);
        if (
          mutation.action !==
          AUTH_ADMIN_MUTATION_ACTIONS.startPasskeyRegistration
        ) {
          await loadUsers(preferredUserId);
          setFeedback({ message: "Access record updated", tone: "good" });
        }
        setError(null);
        return result;
      } catch (mutationError) {
        const message =
          mutationError instanceof Error
            ? mutationError.message
            : "Mutation failed";
        setFeedback({ message, tone: "error" });
        throw mutationError;
      }
    },
    [loadUsers],
  );

  const closeModal = (): void => setModal(null);

  return (
    <>
      <style>{styles}</style>
      <div className="people-surface">
        <nav className="admin-section-nav" aria-label="Administration sections">
          <span className="admin-section-label">Administration</span>
          <a
            className="admin-section-link is-active"
            href={props.bootstrap.routePath}
            aria-current="page"
          >
            <strong>People</strong>
            <small>Access · identity · representation</small>
          </a>
        </nav>
        <header className="people-hero">
          <div>
            <div className="people-kicker">
              Private runtime · Identity ledger
            </div>
            <h1>People</h1>
            <p className="people-hero-copy">
              Access, authentication, canonical claims, and agent consent stay
              private to this brain.
            </p>
          </div>
          <div className="people-hero-meta" aria-label="People summary">
            <div className="people-vital">
              <span>{isAnchor ? users.length : "01"}</span>
              <small>{isAnchor ? "access records" : "your person"}</small>
            </div>
            <div className="people-vital">
              <span>{roleLabel(props.bootstrap.role)}</span>
              <small>{props.bootstrap.displayName}</small>
            </div>
          </div>
        </header>

        {isAnchor && (
          <nav className="people-tabs" aria-label="People views">
            <button
              className={`people-tab${view === "roster" ? " is-active" : ""}`}
              type="button"
              onClick={() => setView("roster")}
            >
              Access roster
            </button>
            <button
              className={`people-tab${view === "representations" ? " is-active" : ""}`}
              type="button"
              onClick={() => setView("representations")}
            >
              My agents
            </button>
          </nav>
        )}

        {error && <p className="people-error-banner">{error}</p>}
        {loading ? (
          <div className="people-loading">Resolving private records…</div>
        ) : view === "representations" ? (
          <RepresentationsView
            representations={representations}
            onAccept={async (agentId) => {
              try {
                await acceptRepresentation(agentId);
                await loadRepresentations();
                setFeedback({
                  message: "Agent representation accepted",
                  tone: "good",
                });
              } catch (acceptError) {
                setFeedback({
                  message:
                    acceptError instanceof Error
                      ? acceptError.message
                      : "Consent failed",
                  tone: "error",
                });
              }
            }}
          />
        ) : (
          <section className="people-panel">
            <header className="people-head">
              <div>
                <div className="eyebrow">Anchor access</div>
                <h2>Access roster</h2>
                <p>
                  Manage each person’s profile, access, and linked agent
                  representatives.
                </p>
              </div>
              <Button tone="primary" onClick={() => setModal({ kind: "add" })}>
                Add person
              </Button>
            </header>
            <div className="people-layout">
              <Roster
                users={users}
                selectedUserId={selectedUserId}
                onSelect={setSelectedUserId}
              />
              <PersonDetail
                user={selectedUser}
                onIdentity={() => setModal({ kind: "identity" })}
                onConfirm={setModal}
                onMutation={runMutation}
                onSetup={(setupUrl, copy) =>
                  setModal({ kind: "setup", setupUrl, copy })
                }
              />
            </div>
          </section>
        )}
      </div>

      {feedback && (
        <p
          className={`people-feedback people-feedback--${feedback.tone}`}
          role="status"
        >
          {feedback.message}
        </p>
      )}

      {modal?.kind === "add" && (
        <AddPersonDialog
          onClose={closeModal}
          onCreate={async (displayName, role) => {
            const result = await runMutation({
              action: AUTH_ADMIN_MUTATION_ACTIONS.createUser,
              confirmation: AUTH_ADMIN_MUTATION_ACTIONS.createUser,
              displayName,
              role,
              status: "active",
            });
            const created = result as { user: AuthAdminUserSummary };
            await loadUsers(created.user.userId);
            closeModal();
            setFeedback({ message: "Person created", tone: "good" });
          }}
        />
      )}

      {modal?.kind === "identity" && selectedUser && (
        <IdentityDialog
          onClose={closeModal}
          onAttach={async (input) => {
            await runMutation(
              {
                action: AUTH_ADMIN_MUTATION_ACTIONS.attachIdentity,
                confirmation: AUTH_ADMIN_MUTATION_ACTIONS.attachIdentity,
                userId: selectedUser.userId,
                ...input,
              },
              selectedUser.userId,
            );
            closeModal();
            setFeedback({ message: "Identity attached", tone: "good" });
          }}
        />
      )}

      {modal?.kind === "confirm" && (
        <ModalFrame
          eyebrow="Confirm access change"
          title={modal.title}
          copy={modal.copy}
          onClose={closeModal}
          onSubmit={(event) => {
            event.preventDefault();
            const run = modal.run;
            closeModal();
            void run().catch(() => undefined);
          }}
          footer={
            <>
              <Button type="button" onClick={closeModal}>
                Cancel
              </Button>
              <Button type="submit" tone="danger">
                {modal.submitLabel}
              </Button>
            </>
          }
        >
          <p className="people-warning">{modal.warning}</p>
        </ModalFrame>
      )}

      {modal?.kind === "setup" && (
        <ModalFrame
          eyebrow="Private delivery"
          title="Passkey setup link"
          copy={modal.copy}
          onClose={closeModal}
          footer={
            <Button tone="primary" onClick={closeModal}>
              Done
            </Button>
          }
        >
          <div className="people-setup-link">
            <code>{modal.setupUrl}</code>
            <Button
              onClick={() => {
                void navigator.clipboard
                  .writeText(modal.setupUrl)
                  .then(() =>
                    setFeedback({ message: "Setup link copied", tone: "good" }),
                  )
                  .catch(() =>
                    setFeedback({
                      message: "Copy failed; select the link manually.",
                      tone: "error",
                    }),
                  );
              }}
            >
              Copy
            </Button>
          </div>
          <p className="people-warning">
            Anyone holding this link can register a passkey until it expires or
            is used.
          </p>
        </ModalFrame>
      )}

      {modal?.kind === "promotion" && (
        <PromotionDialog
          draft={modal.draft}
          users={users}
          selectedUserId={selectedUserId}
          onClose={closeModal}
          onPromote={async (input) => {
            if (input.accessPath === "link") {
              if (!input.userId) throw new Error("Select an existing person");
              await runMutation(
                {
                  action: AUTH_ADMIN_MUTATION_ACTIONS.linkAgentPerson,
                  confirmation: AUTH_ADMIN_MUTATION_ACTIONS.linkAgentPerson,
                  agentId: modal.draft.agentId,
                  userId: input.userId,
                  ...(modal.draft.claims?.length
                    ? { claims: modal.draft.claims }
                    : {}),
                },
                input.userId,
              );
              closeModal();
              setFeedback({
                message: "Representation request created",
                tone: "good",
              });
              return;
            }
            const result = await runMutation({
              action: AUTH_ADMIN_MUTATION_ACTIONS.promoteAgentPerson,
              confirmation: AUTH_ADMIN_MUTATION_ACTIONS.promoteAgentPerson,
              agentId: modal.draft.agentId,
              displayName: input.displayName,
              role: input.role,
              ...(modal.draft.claims?.length
                ? { claims: modal.draft.claims }
                : {}),
            });
            const promoted = result as {
              user: AuthAdminUserSummary;
              registration: { setupUrl: string; expiresAt: number };
            };
            await loadUsers(promoted.user.userId);
            setModal({
              kind: "setup",
              setupUrl: promoted.registration.setupUrl,
              copy: `Send this single-use link to ${promoted.user.displayName} through a private channel. It expires ${formatDate(promoted.registration.expiresAt * 1000)}.`,
            });
            setFeedback({ message: "Invitation created", tone: "good" });
          }}
        />
      )}
    </>
  );
}
