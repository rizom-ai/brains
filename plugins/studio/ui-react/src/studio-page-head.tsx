/** @jsxImportSource react */
import * as stylex from "@stylexjs/stylex";
import { headStyles as s } from "./studio-page-head.styles";
import type {
  RuntimeOperatorActionControl,
  RuntimeStudioOperatorView,
  RuntimeStudioOperatorViewStatus,
  UserPermissionLevel,
} from "@brains/plugins";
import type { ReactElement, ReactNode } from "react";
import type { StudioWorkspaceInfo } from "./api";
import {
  editorClassName as editorClass,
  editorStyles,
} from "./studio-editor.styles";

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
  readonly appearance?: "document";
}): ReactElement {
  const metadata = props.model.metadata?.slice(0, 4) ?? [];
  const totals = props.model.totals.slice(0, 4);

  if (props.appearance === "document") {
    return (
      <header
        className={editorClass("studio-page-head", editorStyles.head)}
        data-studio-page-head="true"
        data-has-status="false"
        data-has-totals="false"
      >
        <div>
          <h2 className={editorClass("", editorStyles.title)}>
            {props.model.title}
          </h2>
        </div>
        {props.action ? (
          <div
            className={editorClass(
              "studio-page-head-action",
              editorStyles.action,
            )}
          >
            {props.action}
          </div>
        ) : null}
      </header>
    );
  }
  return (
    <header
      className={editorClass("studio-page-head", s.root)}
      aria-description={props.model.description}
      data-studio-page-head="true"
      data-has-status={props.model.status ? "true" : "false"}
      data-has-totals={totals.length > 0 ? "true" : "false"}
    >
      <div className={editorClass("studio-page-head-title-row", s.row)}>
        <h1 {...stylex.props(s.title)}>{props.model.title}</h1>
        {metadata.length > 0 && (
          <div className={editorClass("studio-page-head-metadata", s.metadata)}>
            {metadata.map((item, index) => (
              <span
                key={`${item}:${index}`}
                {...stylex.props(index > 0 && s.phoneHidden)}
              >
                {index > 0 && <span aria-hidden="true">· </span>}
                {item}
              </span>
            ))}
          </div>
        )}
        {props.model.status && (
          <span
            className={editorClass(
              "studio-head-status",
              editorStyles.status,
              props.model.status.tone === "good" && s.good,
              props.model.status.tone === "warn" && s.warn,
              props.model.status.tone === "error" && s.error,
              totals.length > 0 && s.phoneHidden,
            )}
            data-tone={props.model.status.tone ?? "neutral"}
          >
            {props.model.status.label}
            {props.model.status.detail && (
              <small {...stylex.props(s.statusDetail)}>
                {props.model.status.detail}
              </small>
            )}
          </span>
        )}
        {totals.length > 0 && (
          <dl className={editorClass("studio-page-head-totals", s.totals)}>
            {totals.map((item, index) => (
              <div
                key={`${item.label}:${index}`}
                data-tone={item.tone ?? "neutral"}
                {...stylex.props(
                  s.total,
                  index > 0 &&
                    item.tone !== "warn" &&
                    item.tone !== "error" &&
                    s.phoneHidden,
                )}
              >
                <dt {...stylex.props(s.totalLabel)}>{item.label}</dt>
                <dd
                  {...stylex.props(
                    s.totalValue,
                    item.tone === "good" && s.good,
                    item.tone === "warn" && s.warn,
                    item.tone === "error" && s.error,
                  )}
                >
                  {item.value}
                </dd>
              </div>
            ))}
          </dl>
        )}
        {props.action && (
          <div
            className={editorClass("studio-page-head-action", s.action)}
            data-studio-primary-action="true"
          >
            {props.action}
          </div>
        )}
      </div>
    </header>
  );
}

/** Normalize declarative semantics without removing or rewriting body blocks. */
export function declarativeStudioPageHead(
  workspace: StudioWorkspaceInfo,
  view: RuntimeStudioOperatorView,
): StudioPageHeadModel {
  return {
    ...(view.kicker ? { kicker: view.kicker } : {}),
    access: studioAccessRequirement(workspace.permission),
    title: view.title ?? workspace.label,
    ...(view.description ? { description: view.description } : {}),
    ...(view.status ? { status: view.status } : {}),
    // Stats already appear in the workspace body; do not repeat them above it.
    totals: [],
    ...(view.primaryAction ? { primaryAction: view.primaryAction } : {}),
  };
}
