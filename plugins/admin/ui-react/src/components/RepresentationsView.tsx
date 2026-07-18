import type { AuthAgentPersonSummary } from "@brains/auth-service/admin-contracts";
import type { ReactElement } from "react";
import { roleLabel } from "../format";
import { AccessItem, Button } from "./primitives";

export function RepresentationsView(props: {
  representations: AuthAgentPersonSummary[];
  onAccept: (agentId: string) => Promise<void>;
}): ReactElement {
  return (
    <section className="people-panel">
      <header className="people-head">
        <div>
          <div className="eyebrow">Your consent</div>
          <h2>My agents</h2>
          <p>
            Review agents that represent your person. Pending links remain
            inactive until you approve them.
          </p>
        </div>
      </header>
      <div className="card people-roster">
        {props.representations.length === 0 ? (
          <p className="people-empty">No agents are linked to your person.</p>
        ) : (
          <div className="people-list">
            {props.representations.map((representation) => (
              <AccessItem
                key={representation.agentId}
                kind="Agent"
                value={`${representation.agentId} · ${roleLabel(representation.status)}`}
                action={
                  representation.status === "pending" ? (
                    <Button
                      tone="primary"
                      onClick={() =>
                        void props.onAccept(representation.agentId)
                      }
                    >
                      Accept
                    </Button>
                  ) : undefined
                }
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
