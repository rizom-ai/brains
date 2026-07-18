import {
  AUTH_USER_ROLES,
  type AuthAdminRole,
  type AuthAdminUserSummary,
  type AuthAgentPersonReconciliationResponse,
} from "@brains/auth-service/admin-contracts";
import { useEffect, useState, type ReactElement } from "react";
import { reconcileAgentPersonClaims } from "../api";
import { Button } from "../components/primitives";
import { messageOf } from "../feedback";
import { roleLabel } from "../format";
import type { AgentPromotionDraft } from "../people-types";
import { ModalFrame } from "./ModalFrame";

export function promotionReconciliationDefaults(
  reconciliation: AuthAgentPersonReconciliationResponse | undefined,
  fallbackUserId: string | undefined,
): {
  accessPath: "invite" | "link";
  userId: string | undefined;
  blocked: boolean;
} {
  if (
    reconciliation?.state === "unique_verified_match" &&
    reconciliation.suggestedUserId
  ) {
    return {
      accessPath: "link",
      userId: reconciliation.suggestedUserId,
      blocked: false,
    };
  }
  return {
    accessPath: "invite",
    userId: fallbackUserId,
    blocked: reconciliation?.state === "cross_person_conflict",
  };
}

export function PromotionReconciliationSummary(props: {
  reconciliation: AuthAgentPersonReconciliationResponse;
}): ReactElement {
  const { reconciliation } = props;
  if (reconciliation.state === "unique_verified_match") {
    const owner = reconciliation.claims.find(
      (claim) => claim.owner?.userId === reconciliation.suggestedUserId,
    )?.owner;
    return (
      <div className="people-reconciliation people-reconciliation--match">
        <strong>Verified person found</strong>
        <p>
          An exact independently verified claim belongs to{" "}
          {owner?.displayName ?? "an existing person"}. That person is
          preselected; continuing creates a representation request rather than a
          duplicate access record.
        </p>
      </div>
    );
  }

  if (reconciliation.state === "cross_person_conflict") {
    const conflicts = reconciliation.claims.filter((claim) => claim.owner);
    return (
      <div
        className="people-reconciliation people-reconciliation--conflict"
        role="alert"
      >
        <strong>Identity reconciliation required</strong>
        <p>
          Exact claims resolve to different People records. Review and correct
          ownership before granting access; no link has been changed.
        </p>
        <ul>
          {conflicts.map((claim) => (
            <li key={`${claim.index}:${claim.type}`}>
              <span>{claim.label ?? roleLabel(claim.type)}</span>
              <b>{claim.owner?.displayName ?? claim.owner?.personId}</b>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="people-reconciliation">
      <strong>No verified person match</strong>
      <p>
        Agent assertions cannot select a person automatically. Choose whether to
        invite a new person or link an existing record.
      </p>
    </div>
  );
}

export function PromotionDialog(props: {
  draft: AgentPromotionDraft;
  users: AuthAdminUserSummary[];
  selectedUserId: string | undefined;
  onClose: () => void;
  onPromote: (input: {
    accessPath: "invite" | "link";
    displayName: string;
    role: AuthAdminRole;
    userId?: string;
  }) => Promise<void>;
}): ReactElement {
  const fallbackUserId = props.selectedUserId ?? props.users[0]?.userId;
  const [accessPath, setAccessPath] = useState<"invite" | "link">("invite");
  const [linkUserId, setLinkUserId] = useState<string | undefined>(
    fallbackUserId,
  );
  const [reconciliation, setReconciliation] =
    useState<AuthAgentPersonReconciliationResponse>();
  const [reconciliationLoading, setReconciliationLoading] = useState(
    (props.draft.claims?.length ?? 0) > 0,
  );
  const [reconciliationError, setReconciliationError] = useState<string | null>(
    null,
  );

  useEffect(() => {
    const claims = props.draft.claims ?? [];
    if (claims.length === 0) {
      setReconciliationLoading(false);
      return;
    }

    let active = true;
    setReconciliationLoading(true);
    setReconciliationError(null);
    void reconcileAgentPersonClaims(claims)
      .then((response) => {
        if (!active) return;
        setReconciliation(response);
        const defaults = promotionReconciliationDefaults(
          response,
          fallbackUserId,
        );
        if (
          defaults.accessPath === "link" &&
          defaults.userId &&
          props.users.some((user) => user.userId === defaults.userId)
        ) {
          setAccessPath("link");
          setLinkUserId(defaults.userId);
        }
      })
      .catch((error: unknown) => {
        if (!active) return;
        setReconciliationError(
          messageOf(error, "Identity comparison unavailable"),
        );
      })
      .finally(() => {
        if (active) setReconciliationLoading(false);
      });
    return (): void => {
      active = false;
    };
  }, [fallbackUserId, props.draft.claims, props.users]);

  const blocked =
    reconciliationLoading ||
    reconciliationError !== null ||
    reconciliation?.state === "cross_person_conflict";

  return (
    <ModalFrame
      eyebrow="Agent → user promotion"
      title="Grant represented person access"
      copy="Invite a new person or connect this agent to an existing person."
      onClose={props.onClose}
      onSubmit={(event) => {
        event.preventDefault();
        if (blocked) return;
        const data = new FormData(event.currentTarget);
        void props.onPromote({
          accessPath,
          displayName: String(data.get("displayName") ?? ""),
          role: String(data.get("role") ?? "trusted") as AuthAdminRole,
          ...(accessPath === "link" && linkUserId
            ? { userId: linkUserId }
            : {}),
        });
      }}
      footer={
        <>
          <Button type="button" onClick={props.onClose}>
            Cancel
          </Button>
          <Button type="submit" tone="primary" disabled={blocked}>
            {reconciliationLoading ? "Comparing…" : "Continue"}
          </Button>
        </>
      }
    >
      <label>
        <span>Agent</span>
        <input
          value={props.draft.displayName ?? props.draft.agentId}
          readOnly
        />
      </label>
      {reconciliationLoading && (
        <p className="people-note">Comparing exact private identity claims…</p>
      )}
      {reconciliation && (
        <PromotionReconciliationSummary reconciliation={reconciliation} />
      )}
      {reconciliationError && (
        <p className="people-error-banner">{reconciliationError}</p>
      )}
      <label>
        <span>Access path</span>
        <select
          value={accessPath}
          onChange={(event) =>
            setAccessPath(event.currentTarget.value as "invite" | "link")
          }
          disabled={reconciliation?.state === "cross_person_conflict"}
        >
          <option value="invite">Invite a new person</option>
          <option value="link">Link an existing person</option>
        </select>
      </label>
      {accessPath === "invite" ? (
        <>
          <label>
            <span>Represented person</span>
            <input
              name="displayName"
              maxLength={200}
              defaultValue={props.draft.displayName ?? ""}
              required
            />
          </label>
          <label>
            <span>Initial role</span>
            <select name="role" defaultValue="trusted">
              {AUTH_USER_ROLES.map((role) => (
                <option key={role} value={role}>
                  {roleLabel(role)}
                </option>
              ))}
            </select>
          </label>
        </>
      ) : (
        <label>
          <span>Existing person</span>
          <select
            name="userId"
            value={linkUserId ?? ""}
            onChange={(event) => setLinkUserId(event.currentTarget.value)}
            required
          >
            {props.users.map((user) => (
              <option key={user.userId} value={user.userId}>
                {user.displayName} · {roleLabel(user.role)} ·{" "}
                {roleLabel(user.status)}
              </option>
            ))}
          </select>
        </label>
      )}
      {(props.draft.claims?.length ?? 0) > 0 && (
        <p className="people-note">
          {props.draft.claims?.length} agent-carried identity{" "}
          {props.draft.claims?.length === 1 ? "assertion" : "assertions"} will
          be retained for review.
        </p>
      )}
      <p className="people-warning">
        Agent assertions never authenticate a person. New access requires a
        passkey; existing-person links require that person’s consent.
      </p>
    </ModalFrame>
  );
}
