/** @jsxImportSource react */
import type {
  RuntimeOperatorActionControl,
  RuntimeStudioOperatorView,
  RuntimeStudioOperatorViewStatus,
  UserPermissionLevel,
} from "@brains/plugins";
import type { ReactElement, ReactNode } from "react";
import type { StudioWorkspaceInfo } from "./api";

type StudioHeadTotal = Extract<
  RuntimeStudioOperatorView["blocks"][number],
  { readonly type: "stats" }
>["items"][number];

export type StudioAccessRequirement =
  | { readonly kind: "session"; readonly label: "Signed in" }
  | {
      readonly kind: "permission";
      readonly label: "Trusted" | "Admin only";
    };

export interface StudioPageHeadModel {
  readonly kicker?: string | undefined;
  readonly access: StudioAccessRequirement;
  readonly title: string;
  readonly metadata?: readonly string[] | undefined;
  readonly description?: string | undefined;
  readonly status?: RuntimeStudioOperatorViewStatus | undefined;
  readonly totals: readonly StudioHeadTotal[];
  readonly primaryAction?: RuntimeOperatorActionControl | undefined;
}

export function studioAccessRequirement(
  permission: UserPermissionLevel,
): StudioAccessRequirement {
  switch (permission) {
    case "public":
      return { kind: "session", label: "Signed in" };
    case "trusted":
      return { kind: "permission", label: "Trusted" };
    case "admin":
      return { kind: "permission", label: "Admin only" };
  }
}

export function StudioPageHead(props: {
  readonly model: StudioPageHeadModel;
  readonly action?: ReactNode;
}): ReactElement {
  const metadata = props.model.metadata?.slice(0, 4) ?? [];
  const totals = props.model.totals.slice(0, 4);

  return (
    <header
      className="studio-page-head"
      data-studio-page-head="true"
      data-has-status={props.model.status ? "true" : "false"}
      data-has-totals={totals.length > 0 ? "true" : "false"}
    >
      <div className="studio-page-head-kicker">
        {props.model.kicker && <span>{props.model.kicker}</span>}
        <span
          className="studio-head-chip studio-head-access"
          data-access={props.model.access.kind}
        >
          {props.model.access.label}
        </span>
      </div>
      <div className="studio-page-head-title-row">
        <h2>{props.model.title}</h2>
        {metadata.length > 0 && (
          <div className="studio-page-head-metadata">
            {metadata.map((item, index) => (
              <span key={`${item}:${index}`}>{item}</span>
            ))}
          </div>
        )}
        {props.model.status && (
          <span
            className="studio-head-chip studio-head-status"
            data-tone={props.model.status.tone ?? "neutral"}
          >
            {props.model.status.label}
            {props.model.status.detail && (
              <small>{props.model.status.detail}</small>
            )}
          </span>
        )}
        {totals.length > 0 && (
          <dl className="studio-page-head-totals">
            {totals.map((item, index) => (
              <div
                key={`${item.label}:${index}`}
                data-tone={item.tone ?? "neutral"}
              >
                <dt>{item.label}</dt>
                <dd>{item.value}</dd>
              </div>
            ))}
          </dl>
        )}
        {props.action && (
          <div
            className="studio-page-head-action"
            data-studio-primary-action="true"
          >
            {props.action}
          </div>
        )}
      </div>
      {props.model.description && (
        <p className="studio-page-head-description">
          {props.model.description}
        </p>
      )}
    </header>
  );
}

/** Normalize declarative semantics without removing or rewriting body blocks. */
export function declarativeStudioPageHead(
  workspace: StudioWorkspaceInfo,
  view: RuntimeStudioOperatorView,
): StudioPageHeadModel {
  const leadingBlock = view.blocks[0];
  const totals = leadingBlock?.type === "stats" ? leadingBlock.items : [];

  return {
    ...(view.kicker ? { kicker: view.kicker } : {}),
    access: studioAccessRequirement(workspace.permission),
    title: view.title ?? workspace.label,
    ...(view.description ? { description: view.description } : {}),
    ...(view.status ? { status: view.status } : {}),
    totals,
    ...(view.primaryAction ? { primaryAction: view.primaryAction } : {}),
  };
}
