import type { AuthAdminUserSummary } from "@brains/auth-service/admin-contracts";
import type { ReactElement } from "react";
import { roleLabel } from "../format";
import { Button, TextAction } from "./primitives";

export function InvitationsView(props: {
  invitations: AuthAdminUserSummary[];
  onAdd: () => void;
  onCreateSetup: (user: AuthAdminUserSummary) => void;
  onCancel: (user: AuthAdminUserSummary) => void;
}): ReactElement {
  return (
    <section className="people-panel" aria-labelledby="invitations-title">
      <header className="people-head">
        <div>
          <div className="eyebrow">Pending access</div>
          <h2 id="invitations-title">Invitations</h2>
          <p>
            Invited is an account status. Every invitation retains its intended
            Trusted or Admin role.
          </p>
        </div>
        <Button tone="primary" onClick={props.onAdd}>
          Add a person
        </Button>
      </header>
      <div className="people-invitation-list">
        {props.invitations.length === 0 ? (
          <div className="card people-empty-state">
            <strong>No pending invitations</strong>
            <p>New setup invitations will appear here until claimed.</p>
          </div>
        ) : (
          props.invitations.map((user) => (
            <article className="card people-invitation" key={user.userId}>
              <div>
                <strong>{user.displayName}</strong>
                <small>
                  {user.externalPeers[0]?.peerId ?? "No external brain"} · setup
                  not yet claimed
                </small>
              </div>
              <span className={`people-role people-role--${user.role}`}>
                {roleLabel(user.role)}
              </span>
              <div className="people-invitation-actions">
                <TextAction onClick={() => props.onCreateSetup(user)}>
                  Create setup link
                </TextAction>
                <TextAction danger onClick={() => props.onCancel(user)}>
                  Cancel
                </TextAction>
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  );
}
