import type {
  AuthAdminUserSummary,
  AuthBrainAnchorSummary,
  AuthInterfacePrincipalGrantSummary,
} from "@brains/auth-service/admin-contracts";
import type { ReactElement } from "react";
import { AnchorPanel } from "./AnchorPanel";
import {
  StandaloneAccessPanel,
  type StandaloneGrantInput,
} from "./StandaloneAccessPanel";

export function OverviewView(props: {
  anchor: AuthBrainAnchorSummary | undefined;
  users: AuthAdminUserSummary[];
  interfaceGrants: AuthInterfacePrincipalGrantSummary[];
  registeredInterfaces?: string[];
  onOpenMembers: () => void;
  onOpenInvitations: () => void;
  onUpsertInterfaceGrant: (input: StandaloneGrantInput) => Promise<void>;
  onRevokeInterfaceGrant: (grant: AuthInterfacePrincipalGrantSummary) => void;
}): ReactElement {
  const activeMembers = props.users.filter(
    (user) => user.status === "active",
  ).length;
  const activeAdmins = props.users.filter(
    (user) => user.status === "active" && user.role === "admin",
  ).length;
  const invitations = props.users.filter(
    (user) => user.status === "invited",
  ).length;
  const suspended = props.users.filter(
    (user) => user.status === "suspended",
  ).length;

  return (
    <section className="people-overview" aria-labelledby="overview-title">
      <header className="people-head people-section-heading">
        <div>
          <div className="eyebrow">Access posture</div>
          <h2 id="overview-title">Overview</h2>
          <p>The brain Anchor and the humans currently administering access.</p>
        </div>
      </header>

      <div id="brain-anchor">
        <AnchorPanel anchor={props.anchor} />
      </div>

      <div className="people-metrics" aria-label="Administration summary">
        <button
          className="people-metric"
          type="button"
          onClick={props.onOpenMembers}
        >
          <span>Active members</span>
          <strong>{activeMembers}</strong>
          <small>
            {activeAdmins} active {activeAdmins === 1 ? "Admin" : "Admins"}
          </small>
        </button>
        <button
          className="people-metric"
          type="button"
          onClick={props.onOpenInvitations}
        >
          <span>Invitations</span>
          <strong>{invitations}</strong>
          <small>Awaiting passkey claim</small>
        </button>
        <div
          className={`people-metric${suspended > 0 ? " has-attention" : ""}`}
        >
          <span>Attention</span>
          <strong>{suspended}</strong>
          <small>
            {suspended > 0 ? "Suspended accounts" : "No access issues"}
          </small>
        </div>
      </div>

      <StandaloneAccessPanel
        grants={props.interfaceGrants}
        {...(props.registeredInterfaces
          ? { registeredInterfaces: props.registeredInterfaces }
          : {})}
        onUpsert={props.onUpsertInterfaceGrant}
        onRevoke={props.onRevokeInterfaceGrant}
      />
    </section>
  );
}
