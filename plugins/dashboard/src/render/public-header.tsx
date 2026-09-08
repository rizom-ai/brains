/** @jsxImportSource react */
import {
  OperatorHeader,
  OperatorHeaderLink,
  OperatorHeaderButton,
} from "@brains/operator-view-react";
import type { JSX } from "react";

export function PublicHeader(props: {
  title: string;
  homeHref: string;
  askHref?: string | undefined;
  loginHref: string;
}): JSX.Element {
  return (
    <OperatorHeader
      className="public-header"
      title={props.title}
      homeHref={props.homeHref}
      mark={Array.from(props.title.trim())[0]?.toUpperCase() ?? "B"}
      label="Public brain"
      actionsLabel="Public actions"
    >
      {props.askHref && (
        <OperatorHeaderLink
          variant="primary"
          className="public-header-ask"
          href={props.askHref}
        >
          Ask <span aria-hidden="true">→</span>
        </OperatorHeaderLink>
      )}
      <OperatorHeaderLink
        variant="secondary"
        className="public-header-sign-in"
        href={props.loginHref}
      >
        Sign in
      </OperatorHeaderLink>
      <OperatorHeaderButton
        id="climateToggle"
        className="public-header-climate"
        aria-label="Toggle climate"
        desktopOnly
      >
        ◐
      </OperatorHeaderButton>
    </OperatorHeader>
  );
}
