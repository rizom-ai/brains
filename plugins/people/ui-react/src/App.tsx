import {
  AUTH_ADMIN_MUTATION_ACTIONS,
  type AuthAdminMutation,
  type AuthAdminRole,
  type AuthAdminUserSummary,
  type AuthAgentPersonSummary,
} from "@brains/auth-service/admin-contracts";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactElement,
} from "react";
import {
  acceptRepresentation,
  fetchRepresentations,
  fetchUsers,
  mutateAdmin,
} from "./api";
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
import { formatDate, roleLabel } from "./format";
import { manualIdentityTypes } from "./identity-providers";
import styles from "./people.css" with { type: "text" };
import type { AgentPromotionDraft, Modal, SurfaceView } from "./people-types";

export { messageOf, manualIdentityTypes };
export { assuranceLabel, initials, roleLabel } from "./format";
export { PromotionReconciliationSummary, promotionReconciliationDefaults };

export interface PeopleBootstrap {
  displayName: string;
  role: AuthAdminRole;
  routePath: string;
  registeredInterfaces?: string[];
}

export interface PeopleAppProps {
  bootstrap: PeopleBootstrap;
  initialUsers?: AuthAdminUserSummary[];
  initialRepresentations?: AuthAgentPersonSummary[];
}

const PROMOTION_STORAGE_KEY = "brains:people-agent-promotion";

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
  const { feedback, setFeedback, runWithFeedback } = useMutationFeedback();
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
        setError(messageOf(loadError, "People unavailable")),
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
  }, [isAnchor, setFeedback]);

  const runMutation = useCallback(
    async (
      mutation: AuthAdminMutation,
      preferredUserId?: string,
      successMessage = "Access record updated",
    ): Promise<unknown> => {
      const reloadUsers =
        mutation.action !==
        AUTH_ADMIN_MUTATION_ACTIONS.startPasskeyRegistration;
      return runWithFeedback(
        async () => {
          const result = await mutateAdmin<unknown>(mutation);
          if (reloadUsers) await loadUsers(preferredUserId);
          setError(null);
          return result;
        },
        {
          fallback: "Mutation failed",
          ...(reloadUsers ? { success: successMessage } : {}),
        },
      );
    },
    [loadUsers, runWithFeedback],
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
              await runWithFeedback(
                async () => {
                  await acceptRepresentation(agentId);
                  await loadRepresentations();
                },
                {
                  success: "Agent representation accepted",
                  fallback: "Consent failed",
                },
              ).catch(() => undefined);
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
            await loadUsers(created.user.userId);
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
            await loadUsers(promoted.user.userId);
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
