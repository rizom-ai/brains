import {
  AUTH_ADMIN_MUTATION_ACTIONS,
  type AuthAdminMutation,
  type AuthAdminRole,
  type AuthAdminUserSummary,
  type AuthAgentPersonSummary,
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
import { acceptRepresentation, mutateAdmin } from "./api";
import { AnchorPanel } from "./components/AnchorPanel";
import { PersonDetail } from "./components/PersonDetail";
import { RepresentationsView } from "./components/RepresentationsView";
import { Roster } from "./components/Roster";
import { Button } from "./components/primitives";
import { AddPersonDialog } from "./dialogs/AddPersonDialog";
import { IdentityDialog } from "./dialogs/IdentityDialog";
import { ModalFrame } from "./dialogs/ModalFrame";
import {
  PromotionDialog,
  PromotionReconciliationSummary,
  promotionReconciliationDefaults,
} from "./dialogs/PromotionDialog";
import { messageOf, useMutationFeedback } from "./feedback";
import { formatDate } from "./format";
import { manualIdentityTypes } from "./identity-providers";
import styles from "./people.css" with { type: "text" };
import type { AgentPromotionDraft, Modal, SurfaceView } from "./people-types";
import {
  anchorQueryOptions,
  invalidateAfterAdminMutation,
  invalidateAfterRepresentationMutation,
  representationsQueryOptions,
  usersQueryOptions,
} from "./queries";

export { messageOf, manualIdentityTypes };
export { assuranceLabel, initials, roleLabel } from "./format";
export { PromotionReconciliationSummary, promotionReconciliationDefaults };

export interface PeopleBootstrap {
  userId: string;
  displayName: string;
  role: AuthAdminRole;
  isAnchor: boolean;
  brainName: string;
  routePath: string;
  registeredInterfaces?: string[];
}

export interface PeopleAppProps {
  bootstrap: PeopleBootstrap;
  initialAnchor?: AuthBrainAnchorSummary;
  initialUsers?: AuthAdminUserSummary[];
  initialRepresentations?: AuthAgentPersonSummary[];
}

const PROMOTION_STORAGE_KEY = "brains:people-agent-promotion";

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
  const representationsQuery = useQuery({
    ...representationsQueryOptions(),
    ...(props.initialRepresentations !== undefined
      ? { initialData: props.initialRepresentations }
      : {}),
  });
  const users = usersQuery.data ?? [];
  const representations = representationsQuery.data ?? [];
  const anchor = anchorQuery.data;
  const activeAdminCount = users.filter(
    (user) => user.role === "admin" && user.status === "active",
  ).length;
  const [selectedUserId, setSelectedUserId] = useState<string | undefined>(
    props.initialUsers?.find((user) => user.userId === props.bootstrap.userId)
      ?.userId ?? props.initialUsers?.[0]?.userId,
  );
  const [view, setView] = useState<SurfaceView>(
    isAdmin ? "roster" : "representations",
  );
  const [modal, setModal] = useState<Modal>(null);
  const { feedback, setFeedback, runWithFeedback } = useMutationFeedback();
  const { mutateAsync: runAdminMutation } = useMutation({
    mutationFn: (mutation: AuthAdminMutation) => mutateAdmin<unknown>(mutation),
    onSuccess: async (_result, mutation) =>
      invalidateAfterAdminMutation(queryClient, mutation.action),
  });
  const { mutateAsync: runRepresentationMutation } = useMutation({
    mutationFn: acceptRepresentation,
    onSuccess: async () => invalidateAfterRepresentationMutation(queryClient),
  });
  const loading = isAdmin
    ? anchorQuery.isPending || usersQuery.isPending
    : representationsQuery.isPending;
  const queryError =
    representationsQuery.error ??
    (isAdmin ? (anchorQuery.error ?? usersQuery.error) : null);
  const error = queryError ? messageOf(queryError, "People unavailable") : null;

  const selectedUser = useMemo(
    () => users.find((user) => user.userId === selectedUserId),
    [selectedUserId, users],
  );

  useEffect(() => {
    setSelectedUserId((current) => {
      if (users.some((user) => user.userId === current)) return current;
      return (
        users.find((user) => user.userId === props.bootstrap.userId)?.userId ??
        users[0]?.userId
      );
    });
  }, [props.bootstrap.userId, users]);

  useEffect(() => {
    if (!isAdmin || typeof window === "undefined") return;
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
  }, [isAdmin, setFeedback]);

  const runMutation = useCallback(
    async (
      mutation: AuthAdminMutation,
      preferredUserId?: string,
      successMessage = "Access record updated",
    ): Promise<unknown> => {
      const refreshesRecords =
        mutation.action !==
        AUTH_ADMIN_MUTATION_ACTIONS.startPasskeyRegistration;
      return runWithFeedback(
        async () => {
          const result = await runAdminMutation(mutation);
          if (preferredUserId) setSelectedUserId(preferredUserId);
          return result;
        },
        {
          fallback: "Mutation failed",
          ...(refreshesRecords ? { success: successMessage } : {}),
        },
      );
    },
    [runAdminMutation, runWithFeedback],
  );

  const closeModal = (): void => setModal(null);

  return (
    <>
      <style>{styles}</style>
      <div className="people-surface">
        <header className="admin-hero">
          <div>
            <h1>Admin</h1>
            <p>members · anchor · access</p>
          </div>
          <div className="admin-hero-meta">
            <span>
              brain <strong>{props.bootstrap.brainName}</strong>
            </span>
            <span>
              {isAdmin
                ? `${users.length} ${users.length === 1 ? "member" : "members"} · ${activeAdminCount} ${activeAdminCount === 1 ? "admin" : "admins"}`
                : "self service"}
            </span>
          </div>
        </header>

        <nav className="admin-tabs" aria-label="Administration sections">
          {isAdmin && <a href="#brain-anchor">Anchor</a>}
          {isAdmin && (
            <button
              className={view === "roster" ? "is-active" : ""}
              type="button"
              onClick={() => setView("roster")}
            >
              Members
            </button>
          )}
          <button
            className={view === "representations" ? "is-active" : ""}
            type="button"
            onClick={() => setView("representations")}
          >
            My agents
          </button>
          {isAdmin && (
            <span>
              Invitations <small>soon</small>
            </span>
          )}
          {isAdmin && (
            <span>
              Audit <small>soon</small>
            </span>
          )}
        </nav>

        {error && <p className="people-error-banner">{error}</p>}
        {loading ? (
          <div className="people-loading">Resolving private records…</div>
        ) : view === "representations" ? (
          <RepresentationsView
            representations={representations}
            onAccept={async (agentId) => {
              await runWithFeedback(
                async () => {
                  await runRepresentationMutation(agentId);
                },
                {
                  success: "Agent representation accepted",
                  fallback: "Consent failed",
                },
              ).catch(() => undefined);
            }}
          />
        ) : (
          <>
            <div id="brain-anchor">
              <AnchorPanel
                anchor={anchor}
                users={users}
                currentUserId={props.bootstrap.userId}
                onMutation={(mutation) =>
                  runMutation(mutation, undefined, "Brain anchor updated")
                }
              />
            </div>
            <section className="people-panel">
              <header className="people-head">
                <div>
                  <div className="eyebrow">Roster</div>
                  <h2>Members</h2>
                  <p>
                    Everyone with a profile on this brain, their access, and any
                    linked brain representatives.
                  </p>
                </div>
                <Button
                  tone="primary"
                  onClick={() => setModal({ kind: "add" })}
                >
                  Add member
                </Button>
              </header>
              <div className="people-layout">
                <Roster
                  users={users}
                  selectedUserId={selectedUserId}
                  currentUserId={props.bootstrap.userId}
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
          </>
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
            const result = await runMutation(
              {
                action: AUTH_ADMIN_MUTATION_ACTIONS.createUser,
                confirmation: AUTH_ADMIN_MUTATION_ACTIONS.createUser,
                displayName,
                role,
                status: "active",
              },
              undefined,
              "Person created",
            );
            const created = result as { user: AuthAdminUserSummary };
            setSelectedUserId(created.user.userId);
            closeModal();
          }}
        />
      )}

      {modal?.kind === "identity" && selectedUser && (
        <IdentityDialog
          identityTypes={manualIdentityTypes(
            props.bootstrap.registeredInterfaces ?? [],
          )}
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
              "Identity attached",
            );
            closeModal();
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
                "Representation request created",
              );
              closeModal();
              return;
            }
            const result = await runMutation(
              {
                action: AUTH_ADMIN_MUTATION_ACTIONS.promoteAgentPerson,
                confirmation: AUTH_ADMIN_MUTATION_ACTIONS.promoteAgentPerson,
                agentId: modal.draft.agentId,
                displayName: input.displayName,
                role: input.role,
                ...(modal.draft.claims?.length
                  ? { claims: modal.draft.claims }
                  : {}),
              },
              undefined,
              "Invitation created",
            );
            const promoted = result as {
              user: AuthAdminUserSummary;
              registration: { setupUrl: string; expiresAt: number };
            };
            setSelectedUserId(promoted.user.userId);
            setModal({
              kind: "setup",
              setupUrl: promoted.registration.setupUrl,
              copy: `Send this single-use link to ${promoted.user.displayName} through a private channel. It expires ${formatDate(promoted.registration.expiresAt * 1000)}.`,
            });
          }}
        />
      )}
    </>
  );
}
