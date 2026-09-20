/** @jsxImportSource react */
import { OperatorTextLink } from "./operator-record";
import type {
  RuntimeOperatorLaunchIntent,
  RuntimeOperatorLinkTarget,
} from "@brains/plugins";
import { useContext, type ReactElement, type ReactNode } from "react";
import {
  OperatorRendererHostContext,
  OpenDetailContext,
} from "./operator-view-host";

export function OperatorLink(props: {
  target: RuntimeOperatorLinkTarget;
  children: ReactNode;
  emphasis?: "normal" | "title" | "quiet" | "action" | undefined;
  onOpenEntity: (entityType: string, id: string) => void;
  onLaunch: (launch: RuntimeOperatorLaunchIntent) => void;
}): ReactElement {
  const openDetail = useContext(OpenDetailContext);
  const host = useContext(OperatorRendererHostContext);
  const target = props.target;
  const resolvedHref = host.resolveLink?.(target);
  if (resolvedHref || target.kind === "external")
    return (
      <OperatorTextLink
        href={resolvedHref ?? (target.kind === "external" ? target.href : "")}
        external={target.kind === "external"}
        emphasis={props.emphasis}
      >
        {props.children}
      </OperatorTextLink>
    );
  if (target.kind === "detail")
    return openDetail ? (
      <OperatorTextLink
        onClick={() => openDetail(target.itemId)}
        emphasis={props.emphasis}
        stretch={props.emphasis === "title"}
      >
        {props.children}
      </OperatorTextLink>
    ) : (
      <>{props.children}</>
    );
  return (
    <OperatorTextLink
      onClick={() =>
        target.kind === "launch"
          ? props.onLaunch(target.launch)
          : props.onOpenEntity(target.entityType, target.id)
      }
      emphasis={props.emphasis}
    >
      {props.children}
    </OperatorTextLink>
  );
}
