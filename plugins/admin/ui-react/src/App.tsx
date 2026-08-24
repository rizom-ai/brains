/** @jsxImportSource react */
import type { AuthAdminRole } from "@brains/auth-service/admin-contracts";
import type { ReactElement } from "react";
import styles from "./people.css" with { type: "text" };

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
}

const WORKSPACES = [
  { label: "People", id: "admin:people" },
  { label: "Invitations", id: "admin:invitations" },
  { label: "Peers", id: "admin:peers" },
  { label: "Audit", id: "admin:audit" },
];

function workspaceHref(id: string): string {
  return `/studio/workspaces/${encodeURIComponent(id)}`;
}

export function PeopleApp({ bootstrap }: PeopleAppProps): ReactElement {
  return (
    <>
      <style>{styles}</style>
      <div className="people-surface">
        <header className="admin-hero">
          <div>
            <h1>Admin</h1>
            <p>administration moved to Studio</p>
          </div>
          <div className="admin-hero-meta">
            <span>
              brain <strong>{bootstrap.brainName}</strong>
            </span>
          </div>
        </header>
        {bootstrap.role !== "admin" ? (
          <div className="card people-empty-state">
            <strong>Admin access required</strong>
            <p>This console is available only to active Administrators.</p>
          </div>
        ) : (
          <section className="card people-empty-state">
            <strong>Administration now lives in Studio</strong>
            <p>
              People, invitations, peers, and audit history are available as
              Admin-only Studio workspaces.
            </p>
            <nav className="admin-tabs" aria-label="Studio administration">
              {WORKSPACES.map((workspace) => (
                <a key={workspace.id} href={workspaceHref(workspace.id)}>
                  {workspace.label}
                </a>
              ))}
            </nav>
          </section>
        )}
      </div>
    </>
  );
}
