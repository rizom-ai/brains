/** @jsxImportSource react */
import {
  type AuthAdminMutation,
  type AuthAdminRole,
  type AuthAdminUserSummary,
  type AuthBrainAnchorSummary,
  type AuthInvitationChannelSummary,
} from "@brains/auth-service/admin-contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
} from "react";
import { mutateAdmin } from "./api";
import { OverviewView } from "./components/OverviewView";
import { PersonDetail } from "./components/PersonDetail";
import { Roster } from "./components/Roster";
import { Button } from "./components/primitives";
import { ModalFrame } from "./dialogs/ModalFrame";
import { messageOf, useMutationFeedback } from "./feedback";
import styles from "./people.css" with { type: "text" };
import type { Modal, SurfaceView } from "./people-types";
import {
  anchorQueryOptions,
  channelsQueryOptions,
  invalidateAfterAdminMutation,
  usersQueryOptions,
} from "./queries";

export { messageOf };
export { assuranceLabel, initials, roleLabel } from "./format";

const SURFACE_VIEWS: readonly SurfaceView[] = ["overview", "members"];

export interface PeopleBootstrap {
  userId: string;
  displayName: string;
  initialPersonId?: string | undefined;
  role: AuthAdminRole;
  isAnchor: boolean;
  brainName: string;
  routePath: string;
}

export interface PeopleAppProps {
  bootstrap: PeopleBootstrap;
  initialAnchor?: AuthBrainAnchorSummary;
  initialUsers?: AuthAdminUserSummary[];
  initialChannels?: AuthInvitationChannelSummary[];
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
  const channelsQuery = useQuery({
    ...channelsQueryOptions(),
    enabled: isAdmin,
    ...(props.initialChannels !== undefined
      ? { initialData: props.initialChannels }
      : {}),
  });
  const users = usersQuery.data ?? [];
  const channels = channelsQuery.data ?? [];
  const anchor = anchorQuery.data;
  const configuredAnchorKind = anchor?.configuredKind ?? "person";
  const organization = configuredAnchorKind === "organization";
  const rosterLabel = organization ? "People" : "Members";
  const activeUsers = users.filter((user) => user.status !== "invited");
  const activeAdminCount = users.filter(
    (user) => user.role === "admin" && user.status === "active",
  ).length;
  const initialContact = props.initialUsers?.find(
    (user) =>
      user.status !== "invited" &&
      user.personId === props.bootstrap.initialPersonId,
  );
  const [selectedUserId, setSelectedUserId] = useState<string | undefined>(
    initialContact?.userId ??
      props.initialUsers?.find((user) => user.userId === props.bootstrap.userId)
        ?.userId ??
      props.initialUsers?.find((user) => user.status !== "invited")?.userId,
  );
  const [view, setView] = useState<SurfaceView>(
    initialContact ? "members" : "overview",
  );
  const initialContactHandled = useRef(
    initialContact !== undefined || !props.bootstrap.initialPersonId,
  );
  const [modal, setModal] = useState<Modal>(null);
  const { feedback, runWithFeedback } = useMutationFeedback();
  const { mutateAsync: runAdminMutation } = useMutation({
    mutationFn: (mutation: AuthAdminMutation) => mutateAdmin<unknown>(mutation),
    onSuccess: async (_result, mutation) =>
      invalidateAfterAdminMutation(queryClient, mutation.action),
  });
  const loading = isAdmin && (anchorQuery.isPending || usersQuery.isPending);
  const queryError = anchorQuery.error ?? usersQuery.error;
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
    if (initialContactHandled.current || usersQuery.isPending) return;
    initialContactHandled.current = true;
    const contact = activeUsers.find(
      (user) => user.personId === props.bootstrap.initialPersonId,
    );
    if (!contact) return;
    setSelectedUserId(contact.userId);
    setView("members");
  }, [activeUsers, props.bootstrap.initialPersonId, usersQuery.isPending]);

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
  const openMembers = (): void => setView("members");

  return (
    <>
      <style>{styles}</style>
      <div className="people-surface">
        <header className="admin-hero">
          <div>
            <h1>Admin</h1>
            <p>
              {organization ? "people administration" : "member administration"}
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
          {SURFACE_VIEWS.map((section) => (
            <button
              key={section}
              className={view === section ? "is-active" : ""}
              type="button"
              onClick={() => setView(section)}
            >
              {section === "members"
                ? rosterLabel
                : section[0]?.toUpperCase() + section.slice(1)}
            </button>
          ))}
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
          />
        ) : (
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
            </header>
            <div className="people-layout">
              <Roster
                users={activeUsers}
                selectedUserId={selectedUserId}
                currentUserId={props.bootstrap.userId}
                channels={channels}
                label={rosterLabel}
                onSelect={setSelectedUserId}
              />
              <PersonDetail
                user={selectedUser}
                brainName={props.bootstrap.brainName}
                activeAdminCount={activeAdminCount}
                channels={channels}
                selfUserId={props.bootstrap.userId}
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
