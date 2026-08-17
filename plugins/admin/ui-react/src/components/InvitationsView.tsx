/** @jsxImportSource react */
import type {
  AuthAdminUserSummary,
  AuthInvitationState,
} from "@brains/auth-service/admin-contracts";
import type { ReactElement } from "react";
import { formatDate, roleLabel } from "../format";
import { Button, TextAction } from "./primitives";

const TERMINAL_STATES = new Set<AuthInvitationState>([
  "claimed",
  "expired",
  "cancelled",
]);

export function InvitationsView(props: {
  invitations: AuthAdminUserSummary[];
  onAdd: () => void;
  onCreateSetup: (user: AuthAdminUserSummary) => void;
  onCancel: (user: AuthAdminUserSummary) => void;
}): ReactElement {
  const pending = props.invitations.filter(
    (user) => user.invitation && !TERMINAL_STATES.has(user.invitation.state),
  );
  const history = props.invitations.filter(
    (user) => user.invitation && TERMINAL_STATES.has(user.invitation.state),
  );

  return (
    <section className="people-panel" aria-labelledby="invitations-title">
      <header className="people-head">
        <div>
          <div className="eyebrow">Pending access</div>
          <h2 id="invitations-title">Invitations</h2>
          <p>
            Delivery and claim state are retained independently from account
            access.
          </p>
        </div>
        <Button tone="primary" onClick={props.onAdd}>
          Add a person
        </Button>
      </header>
      <InvitationList
        emptyCopy="New invitations will appear here until claimed."
        invitations={pending}
        onCancel={props.onCancel}
        onCreateSetup={props.onCreateSetup}
      />
      {history.length > 0 ? (
        <section aria-labelledby="invitation-history-title">
          <header className="people-section-label">
            <h3 id="invitation-history-title">Invitation history</h3>
            <p>Claimed, expired, and cancelled invitations remain visible.</p>
          </header>
          <InvitationList
            invitations={history}
            onCancel={props.onCancel}
            onCreateSetup={props.onCreateSetup}
          />
        </section>
      ) : null}
    </section>
  );
}

function InvitationList(props: {
  invitations: AuthAdminUserSummary[];
  emptyCopy?: string;
  onCreateSetup: (user: AuthAdminUserSummary) => void;
  onCancel: (user: AuthAdminUserSummary) => void;
}): ReactElement {
  if (props.invitations.length === 0) {
    return (
      <div className="people-invitation-list">
        <div className="card people-empty-state">
          <strong>No pending invitations</strong>
          <p>{props.emptyCopy ?? "No invitation history yet."}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="people-invitation-list">
      {props.invitations.map((user) => {
        const invitation = user.invitation;
        if (!invitation) return null;
        const terminal = TERMINAL_STATES.has(invitation.state);
        return (
          <article className="card people-invitation" key={invitation.id}>
            <div>
              <strong>{user.displayName}</strong>
              <small>
                {user.externalPeers[0]?.peerId ?? "No external brain"} ·{" "}
                {invitationStateLabel(invitation.state)} ·{" "}
                {formatDate(
                  invitation.claimedAt ??
                    invitation.cancelledAt ??
                    invitation.expiredAt ??
                    invitation.sentAt ??
                    invitation.updatedAt,
                )}
              </small>
            </div>
            <span className={`people-role people-role--${user.role}`}>
              {roleLabel(user.role)}
            </span>
            {terminal ? null : (
              <div className="people-invitation-actions">
                {invitation.state === "sending" ? null : (
                  <TextAction onClick={() => props.onCreateSetup(user)}>
                    {invitation.state === "failed" ? "Retry" : "Resend"}
                  </TextAction>
                )}
                <TextAction danger onClick={() => props.onCancel(user)}>
                  Cancel
                </TextAction>
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}

function invitationStateLabel(state: AuthInvitationState): string {
  return `${state.slice(0, 1).toUpperCase()}${state.slice(1)}`;
}
