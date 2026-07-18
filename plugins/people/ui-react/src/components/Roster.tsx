import type { AuthAdminUserSummary } from "@brains/auth-service/admin-contracts";
import type { ReactElement } from "react";
import { initials, roleLabel } from "../format";

export function Roster(props: {
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
