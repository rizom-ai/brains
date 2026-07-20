/** @jsxImportSource react */
import type { AuthBrainAnchorSummary } from "@brains/auth-service/admin-contracts";
import type { ReactElement } from "react";
import { cmsEntityHref, initials } from "../format";

function anchorDescription(anchor: AuthBrainAnchorSummary): string {
  switch (anchor.configuredKind) {
    case "person":
      return "this brain belongs to one person and speaks as them.";
    case "team":
      return "this brain belongs to the team and is run together. No one person is the Anchor.";
    case "organization":
      return "this brain belongs to the organization and is administered on its behalf. No one person is the Anchor.";
  }
}

export function AnchorPanel(props: {
  anchor: AuthBrainAnchorSummary | undefined;
}): ReactElement {
  const anchor = props.anchor;
  if (!anchor) {
    return (
      <section className="anchor-panel anchor-panel--loading">
        Resolving Anchor…
      </section>
    );
  }

  const profileHref = anchor.profileEntityId
    ? cmsEntityHref(anchor.profileEntityId)
    : undefined;
  const profileLabel =
    anchor.configuredKind === "person"
      ? "Profile"
      : anchor.configuredKind === "team"
        ? "Team profile"
        : "Organization";

  return (
    <section className="anchor-panel" aria-labelledby="anchor-title">
      <div className="anchor-top">
        <div
          className={`anchor-crest${anchor.kind === "collective" ? " anchor-crest--collective" : ""}`}
          aria-hidden="true"
        >
          {initials(anchor.displayName)}
        </div>
        <div className="anchor-id">
          <div className="eyebrow">Brain owner</div>
          <h2 id="anchor-title">{anchor.displayName}</h2>
          <p>
            Anchor · <strong>{anchor.configuredKind}</strong> —{" "}
            {anchorDescription(anchor)}
          </p>
        </div>
        <div className="anchor-config-chip">
          <span aria-hidden="true">⚙</span> kind: {anchor.configuredKind} ·
          brain.yaml
        </div>
      </div>

      <div className="anchor-fields">
        <div className="anchor-field">
          <span>{profileLabel}</span>
          <strong>{anchor.displayName}</strong>
          <small>The CMS profile is authoritative.</small>
          {profileHref && (
            <a className="anchor-cms-link" href={profileHref}>
              Edit in CMS →
            </a>
          )}
        </div>
        <div className="anchor-field">
          <span>Ownership</span>
          <strong>
            {anchor.kind === "person"
              ? "Personal · Admin + Anchor"
              : `${anchor.configuredKind === "team" ? "Team" : "Organization"} · impersonal`}
          </strong>
          <small>
            {anchor.kind === "person"
              ? "The personal Anchor must remain an active Admin."
              : "isAnchor is false for every member."}
          </small>
        </div>
        <div className="anchor-field anchor-field--admin">
          <span>Administered by</span>
          <strong>
            {anchor.administeredBy} active{" "}
            {anchor.administeredBy === 1 ? "Admin" : "Admins"}
          </strong>
          <small>The last active Admin is protected.</small>
        </div>
      </div>
    </section>
  );
}
