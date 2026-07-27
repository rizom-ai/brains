import {
  AUTH_ADMIN_MUTATION_ACTIONS,
  type AuthAdminMutation,
  type AuthAdminRole,
  type AuthAdminUserSummary,
  type AuthAuditEventSummary,
  type AuthBrainAnchorSummary,
} from "@brains/auth-service/admin-contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactElement,
} from "react";
import { mutateAdmin } from "./api";
import { AuditView } from "./components/AuditView";
import { InvitationsView } from "./components/InvitationsView";
import { OverviewView } from "./components/OverviewView";
import { PersonDetail } from "./components/PersonDetail";
import { Roster } from "./components/Roster";
import { Button } from "./components/primitives";
import {
  AddPersonDialog,
  type AddPersonInput,
} from "./dialogs/AddPersonDialog";
import { ModalFrame } from "./dialogs/ModalFrame";
import { messageOf, useMutationFeedback } from "./feedback";
import { formatDate } from "./format";
import styles from "./people.css" with { type: "text" };
import type {
  ExternalPeerInvitationDraft,
  Modal,
  SurfaceView,
} from "./people-types";
import {
  anchorQueryOptions,
  auditQueryOptions,
  invalidateAfterAdminMutation,
  usersQueryOptions,
} from "./queries";

export { messageOf };
export { assuranceLabel, initials, roleLabel } from "./format";

const PEER_INVITATION_STORAGE_KEY = "brains:admin-peer-invitation";

export function buildInvitationMutation(
  input: AddPersonInput,
): Extract<AuthAdminMutation, { action: "createInvitation" }> {
  return {
    action: AUTH_ADMIN_MUTATION_ACTIONS.createInvitation,
    confirmation: AUTH_ADMIN_MUTATION_ACTIONS.createInvitation,
    idempotencyKey: input.idempotencyKey,
    displayName: input.displayName,
    role: input.role,
    delivery: input.delivery,
    ...(input.peerId ? { peerId: input.peerId } : {}),
  };
}

interface SetupRegistration {
  setupUrl: string;
  expiresAt: number;
  delivery?: { type: "email" | "discord"; label: string };
}

export interface PeopleBootstrap {
  userId: string;
  displayName: string;
  role: AuthAdminRole;
  isAnchor: boolean;
  brainName: string;
  routePath: string;
}

export interface PeopleAppProps {
  bootstrap: PeopleBootstrap;
  initialAnchor?: AuthBrainAnchorSummary;
  initialUsers?: AuthAdminUserSummary[];
  initialAudit?: AuthAuditEventSummary[];
}

export function PeopleApp(props: PeopleAppProps): ReactElement {
  const isAdmin = props.bootstrap.role === "admin";
  const queryClient = useQueryClient();
  const anchorQuery = useQuery({
    ...anchorQueryOptions(),
    enabled: isAdmin,
    ...(props.initialAnchor !== undefined
      ? { initialData: props.initialAnchor }
      : {}),
  });
  const usersQuery = useQuery({
    ...usersQueryOptions(),
    enabled: isAdmin,
    ...(props.initialUsers !== undefined
      ? { initialData: props.initialUsers }
      : {}),
  });
  const auditQuery = useQuery({
    ...auditQueryOptions(),
    enabled: isAdmin,
    ...(props.initialAudit !== undefined
      ? { initialData: props.initialAudit }
      : {}),
  });
  const users = usersQuery.data ?? [];
  const auditEvents = auditQuery.data ?? [];
  const anchor = anchorQuery.data;
  const configuredAnchorKind = anchor?.configuredKind ?? "person";
  const organization = configuredAnchorKind === "organization";
  const rosterLabel = organization ? "People" : "Members";
  const rosterSingular = organization ? "person" : "member";
  const activeUsers = users.filter((user) => user.status !== "invited");
  const invitations = users.filter((user) => user.invitation !== undefined);
  const pendingInvitationCount = invitations.filter(
    (user) =>
      user.invitation &&
      !["claimed", "expired", "cancelled"].includes(user.invitation.state),
  ).length;
  const activeAdminCount = users.filter(
    (user) => user.role === "admin" && user.status === "active",
  ).length;
  const [selectedUserId, setSelectedUserId] = useState<string | undefined>(
    props.initialUsers?.find((user) => user.userId === props.bootstrap.userId)
      ?.userId ??
      props.initialUsers?.find((user) => user.status !== "invited")?.userId,
  );
  const [view, setView] = useState<SurfaceView>("overview");
  const [modal, setModal] = useState<Modal>(null);
  const { feedback, setFeedback, runWithFeedback } = useMutationFeedback();
  const { mutateAsync: runAdminMutation } = useMutation({
    mutationFn: (mutation: AuthAdminMutation) => mutateAdmin<unknown>(mutation),
    onSuccess: async (_result, mutation) =>
      invalidateAfterAdminMutation(queryClient, mutation.action),
  });
  const loading =
    isAdmin &&
    (anchorQuery.isPending || usersQuery.isPending || auditQuery.isPending);
  const queryError = anchorQuery.error ?? usersQuery.error ?? auditQuery.error;
  const error = queryError ? messageOf(queryError, "Admin unavailable") : null;

  const selectedUser = useMemo(
    () => activeUsers.find((user) => user.userId === selectedUserId),
    [activeUsers, selectedUserId],
  );

  useEffect(() => {
    setSelectedUserId((current) => {
      if (activeUsers.some((user) => user.userId === current)) return current;
      return (
        activeUsers.find((user) => user.userId === props.bootstrap.userId)
          ?.userId ?? activeUsers[0]?.userId
      );
    });
  }, [activeUsers, props.bootstrap.userId]);

  useEffect(() => {
    if (!isAdmin || typeof window === "undefined") return;
    const raw = window.sessionStorage.getItem(PEER_INVITATION_STORAGE_KEY);
    if (!raw) return;
    window.sessionStorage.removeItem(PEER_INVITATION_STORAGE_KEY);
    try {
      const draft = JSON.parse(raw) as ExternalPeerInvitationDraft;
      if (typeof draft.peerId !== "string" || !draft.peerId.trim()) return;
      setView("invitations");
      setModal({
        kind: "add",
        draft: {
          peerId: draft.peerId,
          ...(typeof draft.displayName === "string" && draft.displayName.trim()
            ? { displayName: draft.displayName }
            : {}),
        },
      });
    } catch {
      // Ignore malformed cross-surface navigation state.
    }
  }, [isAdmin]);

  const runMutation = useCallback(
    async (
      mutation: AuthAdminMutation,
      preferredUserId?: string,
      successMessage = "Access record updated",
    ): Promise<unknown> =>
      runWithFeedback(
        async () => {
          const result = await runAdminMutation(mutation);
          if (preferredUserId) setSelectedUserId(preferredUserId);
          return result;
        },
        { fallback: "Mutation failed", success: successMessage },
      ),
    [runAdminMutation, runWithFeedback],
  );

  const closeModal = (): void => setModal(null);

  const showSetup = (
    user: { userId: string; displayName: string },
    registration: SetupRegistration,
    destination = registration.delivery?.label ?? "the confirmed channel",
  ): void => {
    setSelectedUserId(user.userId);
    setModal({
      kind: "setup",
      setupUrl: registration.setupUrl,
      copy: `This single-use link is bound to ${destination}. Deliver it only through that confirmed private channel, and open it in the intended person’s browser or a private window—not an existing Admin session. It expires ${formatDate(registration.expiresAt * 1000)}.`,
    });
  };

  const createSetup = (user: AuthAdminUserSummary): void => {
    if (!user.invitation) return;
    void runMutation(
      {
        action: AUTH_ADMIN_MUTATION_ACTIONS.resendInvitation,
        confirmation: AUTH_ADMIN_MUTATION_ACTIONS.resendInvitation,
        invitationId: user.invitation.id,
      },
      user.userId,
      "Invitation retry recorded",
    )
      .then((result) => {
        const resent = result as {
          invitation: { state: string };
          registration: SetupRegistration;
        };
        if (resent.invitation.state === "failed") {
          setFeedback({
            tone: "error",
            message:
              "Invitation saved, but delivery failed. Check email delivery configuration before retrying.",
          });
          return;
        }
        setFeedback({ message: "Invitation resent", tone: "good" });
        const destination =
          user.identities.find(
            (identity) =>
              identity.type === "email" || identity.type === "discord",
          )?.label ?? "the confirmed channel";
        showSetup(user, resent.registration, destination);
      })
      .catch(() => undefined);
  };

  const createInvitation = async (input: AddPersonInput): Promise<void> => {
    const created = (await runMutation(
      buildInvitationMutation(input),
      undefined,
      "Invitation recorded",
    )) as {
      invitation: { state: string };
      user: { userId: string; displayName: string };
      registration?: SetupRegistration;
    };
    if (!created.registration || created.invitation.state === "failed") {
      setSelectedUserId(created.user.userId);
      setView("invitations");
      closeModal();
      if (created.invitation.state === "failed") {
        setFeedback({
          tone: "error",
          message:
            "Invitation saved, but delivery failed. Configure email delivery or retry from Invitations.",
        });
      }
      return;
    }
    const destination =
      input.delivery.type === "email"
        ? input.delivery.subject
        : input.delivery.label;
    if (
      input.delivery.type === "email" &&
      created.invitation.state === "sent"
    ) {
      setFeedback({ message: "Invitation email sent", tone: "good" });
      setSelectedUserId(created.user.userId);
      setModal({
        kind: "setup",
        setupUrl: created.registration.setupUrl,
        copy: `The invitation email to ${destination} was accepted by the delivery provider. The single-use link expires ${formatDate(created.registration.expiresAt * 1000)}.`,
      });
      return;
    }
    showSetup(created.user, created.registration, destination);
  };

  const openMembers = (): void => setView("members");
  const openInvitations = (): void => setView("invitations");

  return (
    <>
      <style>{styles}</style>
      <div className="people-surface">
        <header className="admin-hero">
          <div>
            <h1>Admin</h1>
            <p>
              {organization
                ? "people · invitations · audit"
                : "members · invitations · audit"}
            </p>
          </div>
          <div className="admin-hero-meta">
            <span>
              brain <strong>{props.bootstrap.brainName}</strong>
            </span>
            <span>
              {activeUsers.length}{" "}
              {activeUsers.length === 1 ? "member" : "members"} ·{" "}
              {activeAdminCount} {activeAdminCount === 1 ? "admin" : "admins"}
            </span>
          </div>
        </header>

        <nav className="admin-tabs" aria-label="Administration sections">
          {(["overview", "members", "invitations", "audit"] as const).map(
            (section) => (
              <button
                key={section}
                className={view === section ? "is-active" : ""}
                type="button"
                onClick={() => setView(section)}
              >
                {section === "members"
                  ? rosterLabel
                  : section[0]?.toUpperCase() + section.slice(1)}
                {section === "invitations" && pendingInvitationCount > 0 ? (
                  <small>{pendingInvitationCount}</small>
                ) : null}
              </button>
            ),
          )}
        </nav>

        {!isAdmin ? (
          <div className="card people-empty-state">
            <strong>Admin access required</strong>
            <p>This console is available only to active Administrators.</p>
          </div>
        ) : error ? (
          <p className="people-error-banner">{error}</p>
        ) : loading ? (
          <div className="people-loading">Resolving private records…</div>
        ) : view === "overview" ? (
          <OverviewView
            anchor={anchor}
            users={users}
            onOpenMembers={openMembers}
            onOpenInvitations={openInvitations}
          />
        ) : view === "members" ? (
          <section className="people-panel">
            <header className="people-head">
              <div>
                <div className="eyebrow">Roster</div>
                <h2>{rosterLabel}</h2>
                <p>
                  Local accounts, sign-in, connected channels, access, and
                  optional external peers.
                </p>
              </div>
              <Button tone="primary" onClick={() => setModal({ kind: "add" })}>
                Add {rosterSingular}
              </Button>
            </header>
            <div className="people-layout">
              <Roster
                users={activeUsers}
                selectedUserId={selectedUserId}
                currentUserId={props.bootstrap.userId}
                label={rosterLabel}
                onSelect={setSelectedUserId}
              />
              <PersonDetail
                user={selectedUser}
                brainName={props.bootstrap.brainName}
                activeAdminCount={activeAdminCount}
                selfUserId={props.bootstrap.userId}
                onConfirm={setModal}
                onMutation={runMutation}
                onSetup={(setupUrl, copy) =>
                  setModal({ kind: "setup", setupUrl, copy })
                }
              />
            </div>
          </section>
        ) : view === "invitations" ? (
          <InvitationsView
            invitations={invitations}
            onAdd={() => setModal({ kind: "add" })}
            onCreateSetup={createSetup}
            onCancel={(user) =>
              setModal({
                kind: "confirm",
                title: `Cancel ${user.displayName}’s invitation?`,
                copy: "The pending account will be suspended and its setup links revoked.",
                warning:
                  "The person and peer association remain in audit history.",
                submitLabel: "Cancel invitation",
                run: async () => {
                  if (!user.invitation) return;
                  await runMutation(
                    {
                      action: AUTH_ADMIN_MUTATION_ACTIONS.cancelInvitation,
                      confirmation:
                        AUTH_ADMIN_MUTATION_ACTIONS.cancelInvitation,
                      invitationId: user.invitation.id,
                    },
                    undefined,
                    "Invitation cancelled",
                  );
                },
              })
            }
          />
        ) : (
          <AuditView events={auditEvents} users={users} />
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
          {...(modal.draft ? { initialDraft: modal.draft } : {})}
          onClose={closeModal}
          onCreate={(input) => createInvitation(input).catch(() => undefined)}
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
                void runWithFeedback(
                  () => navigator.clipboard.writeText(modal.setupUrl),
                  {
                    success: "Setup link copied",
                    fallback: "Copy failed; select the link manually.",
                  },
                ).catch(() => undefined);
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
    </>
  );
}
