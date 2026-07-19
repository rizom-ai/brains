/** @jsxImportSource react */
import {
  AUTH_ADMIN_MUTATION_ACTIONS,
  type AuthAdminMutation,
  type AuthAdminUserSummary,
  type AuthBrainAnchorSummary,
} from "@brains/auth-service/admin-contracts";
import { useEffect, useMemo, useState, type ReactElement } from "react";
import { initials } from "../format";
import { Button } from "./primitives";

export function AnchorPanel(props: {
  anchor: AuthBrainAnchorSummary | undefined;
  users: AuthAdminUserSummary[];
  currentUserId: string;
  onMutation: (mutation: AuthAdminMutation) => Promise<unknown>;
}): ReactElement {
  const [kind, setKind] = useState<"person" | "collective">(
    props.anchor?.kind ?? "person",
  );
  const activeAdmins = useMemo(
    () =>
      props.users.filter(
        (user) => user.role === "admin" && user.status === "active",
      ),
    [props.users],
  );
  const defaultPersonId =
    activeAdmins.find((user) => user.isAnchor)?.userId ??
    activeAdmins.find((user) => user.userId === props.currentUserId)?.userId ??
    activeAdmins[0]?.userId ??
    "";
  const [personUserId, setPersonUserId] = useState(defaultPersonId);
  const [collectiveName, setCollectiveName] = useState(
    props.anchor?.kind === "collective" ? props.anchor.displayName : "",
  );

  useEffect(() => {
    setKind(props.anchor?.kind ?? "person");
    if (props.anchor?.kind === "collective") {
      setCollectiveName(props.anchor.displayName);
    }
  }, [props.anchor]);

  useEffect(() => {
    if (!personUserId && defaultPersonId) setPersonUserId(defaultPersonId);
  }, [defaultPersonId, personUserId]);

  if (!props.anchor) {
    return (
      <section className="anchor-panel anchor-panel--loading">
        Resolving Anchor…
      </section>
    );
  }

  const changed =
    kind !== props.anchor.kind ||
    (kind === "person" &&
      activeAdmins.find((user) => user.userId === personUserId)?.personId !==
        props.anchor.personId) ||
    (kind === "collective" &&
      collectiveName.trim() !== props.anchor.displayName);
  const selectedPerson = activeAdmins.find(
    (user) => user.userId === personUserId,
  );
  const previewName =
    kind === "person"
      ? (selectedPerson?.displayName ?? props.anchor.displayName)
      : collectiveName.trim() || props.anchor.displayName;

  return (
    <section className="anchor-panel" aria-labelledby="anchor-title">
      <div className="anchor-top">
        <div
          className={`anchor-crest${kind === "collective" ? " anchor-crest--collective" : ""}`}
          aria-hidden="true"
        >
          {initials(previewName)}
        </div>
        <div className="anchor-id">
          <div className="eyebrow">Brain owner</div>
          <h2 id="anchor-title">{previewName}</h2>
          <p>
            Anchor · <strong>{kind}</strong> —{" "}
            {kind === "person"
              ? "this brain is owned by, and speaks as, one person."
              : "owned by the collective and run by any active Admin. No one person is the Anchor."}
          </p>
        </div>
        <div className="anchor-kind-toggle" aria-label="Anchor kind">
          <button
            className={kind === "person" ? "is-active" : ""}
            type="button"
            onClick={() => setKind("person")}
          >
            Person
          </button>
          <button
            className={kind === "collective" ? "is-active" : ""}
            type="button"
            onClick={() => setKind("collective")}
          >
            Collective
          </button>
        </div>
      </div>

      <div className="anchor-fields">
        <label className="anchor-field">
          <span>Public name</span>
          {kind === "person" ? (
            <select
              value={personUserId}
              onChange={(event) => setPersonUserId(event.currentTarget.value)}
            >
              {activeAdmins.map((user) => (
                <option key={user.userId} value={user.userId}>
                  {user.displayName}
                </option>
              ))}
            </select>
          ) : (
            <input
              value={collectiveName}
              maxLength={200}
              placeholder="Collective name"
              onChange={(event) => setCollectiveName(event.currentTarget.value)}
            />
          )}
        </label>
        <div className="anchor-field">
          <span>Profile / persona</span>
          <strong>
            {props.anchor.profileEntityId ?? "Profile details not linked"}
          </strong>
        </div>
        <div className="anchor-field anchor-field--admin">
          <span>Administered by</span>
          <strong>
            {props.anchor.administeredBy} active{" "}
            {props.anchor.administeredBy === 1 ? "Admin" : "Admins"}
          </strong>
          {changed && (
            <Button
              tone="primary"
              onClick={() => {
                const mutation: AuthAdminMutation =
                  kind === "person"
                    ? {
                        action: AUTH_ADMIN_MUTATION_ACTIONS.updateBrainAnchor,
                        confirmation:
                          AUTH_ADMIN_MUTATION_ACTIONS.updateBrainAnchor,
                        kind,
                        userId: personUserId,
                      }
                    : {
                        action: AUTH_ADMIN_MUTATION_ACTIONS.updateBrainAnchor,
                        confirmation:
                          AUTH_ADMIN_MUTATION_ACTIONS.updateBrainAnchor,
                        kind,
                        displayName: collectiveName.trim(),
                      };
                void props.onMutation(mutation).catch(() => undefined);
              }}
            >
              Save Anchor
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}
