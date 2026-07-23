import type {
  AuthAdminUserSummary,
  AuthAuditEventSummary,
} from "@brains/auth-service/admin-contracts";
import type { ReactElement } from "react";
import { formatDate, roleLabel } from "../format";

const actionLabels: Record<string, string> = {
  "auth.a2a_peer_trust.granted": "trusted an A2A peer",
  "auth.a2a_peer_trust.revoked": "revoked A2A peer trust",
  "auth.access.reinitialized": "reinitialized access from configuration",
  "auth.external_peer.invited": "invited a person from an external peer",
  "auth.external_peer.linked": "linked an external peer",
  "auth.identity.attached": "connected an identity",
  "auth.identity.detached": "disconnected an identity",
  "auth.identity.delivery_bound": "bound a verified delivery channel",
  "auth.passkey.authentication_failed": "recorded a failed passkey sign-in",
  "auth.passkey.migrated": "migrated a passkey",
  "auth.passkey.registered": "registered a passkey",
  "auth.passkey.registration_failed": "recorded a failed passkey registration",
  "auth.passkey.registration_started": "created a passkey setup link",
  "auth.passkey.revoked": "revoked a passkey",
  "auth.setup_token.generated": "generated a setup token",
  "auth.user.created": "created an account",
  "auth.user.deleted": "deleted a suspended account",
  "auth.user.grants_revoked": "revoked account grants",
  "auth.user.role_updated": "changed an account role",
  "auth.user.status_updated": "changed account status",
};

export function AuditView(props: {
  events: AuthAuditEventSummary[];
  users: AuthAdminUserSummary[];
}): ReactElement {
  const namesById = new Map(
    props.users.map((user) => [user.userId, user.displayName]),
  );

  return (
    <section className="people-panel" aria-labelledby="audit-title">
      <header className="people-head">
        <div>
          <div className="eyebrow">Security history</div>
          <h2 id="audit-title">Audit</h2>
          <p>Who changed access, what changed, and when.</p>
        </div>
      </header>
      <div className="card people-audit-list">
        {props.events.length === 0 ? (
          <p className="people-empty">No audit events recorded.</p>
        ) : (
          props.events.map((event) => {
            const actor = event.actorUserId
              ? (namesById.get(event.actorUserId) ?? "Former Admin")
              : "System";
            const target = event.targetId
              ? (namesById.get(event.targetId) ?? event.targetType ?? "record")
              : (event.targetType ?? "access");
            const action =
              actionLabels[event.action] ??
              roleLabel(event.action.replaceAll(".", " "));
            return (
              <article className="people-audit-event" key={event.id}>
                <time dateTime={new Date(event.createdAt).toISOString()}>
                  {formatDate(event.createdAt)}
                </time>
                <span>
                  <strong>{actor}</strong> {action}
                  <small>{target}</small>
                </span>
              </article>
            );
          })
        )}
      </div>
    </section>
  );
}
