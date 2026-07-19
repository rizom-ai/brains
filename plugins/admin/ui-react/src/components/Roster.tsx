import type { AuthAdminUserSummary } from "@brains/auth-service/admin-contracts";
import { useMemo, useState, type ReactElement } from "react";
import { initials, roleLabel } from "../format";

export function Roster(props: {
  users: AuthAdminUserSummary[];
  selectedUserId: string | undefined;
  currentUserId: string;
  onSelect: (userId: string) => void;
}): ReactElement {
  const [query, setQuery] = useState("");
  const visibleUsers = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return props.users;
    return props.users.filter((user) =>
      [user.displayName, user.role, user.status].some((value) =>
        value.toLowerCase().includes(normalized),
      ),
    );
  }, [props.users, query]);

  return (
    <section className="card people-roster" aria-label="Members list">
      <label className="people-roster-search">
        <span aria-hidden="true">⌕</span>
        <input
          value={query}
          placeholder="Search members…"
          aria-label="Search members"
          onChange={(event) => setQuery(event.currentTarget.value)}
        />
      </label>
      <div className="people-list" aria-live="polite">
        {visibleUsers.length === 0 ? (
          <p className="people-empty">
            {props.users.length === 0
              ? "No members have been added."
              : "No members match this search."}
          </p>
        ) : (
          visibleUsers.map((user) => {
            const selected = user.userId === props.selectedUserId;
            const identityKinds = [
              ...(user.userId === props.currentUserId ? ["you"] : []),
              ...new Set(
                user.identities
                  .filter((identity) => identity.revokedAt === undefined)
                  .map((identity) => roleLabel(identity.type).toLowerCase()),
              ),
              ...(user.passkeys.length > 0 ? ["passkey"] : []),
              ...(user.status === "invited" ? ["invited"] : []),
            ];
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
                  {user.isAnchor && (
                    <span className="people-anchor-pin" title="Brain Anchor">
                      ⚓
                    </span>
                  )}
                </span>
                <span className="people-row-identity">
                  <span className="people-row-name">{user.displayName}</span>
                  <span className="people-row-meta">
                    {identityKinds.length > 0
                      ? identityKinds.join(" · ")
                      : roleLabel(user.status)}
                  </span>
                </span>
                <span className="people-row-access">
                  <span className={`people-role people-role--${user.role}`}>
                    {roleLabel(user.role)}
                  </span>
                  <span className="people-host-chip">Hosted</span>
                </span>
              </button>
            );
          })
        )}
      </div>
    </section>
  );
}
