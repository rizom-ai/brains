/** @jsxImportSource preact */
import type { JSX } from "preact";
import type { DashboardOperatorAccess } from "./types";

function BrandTitle({ title }: { title: string }): JSX.Element {
  const trimmed = title.trim();
  const lastSpace = trimmed.lastIndexOf(" ");

  if (lastSpace <= 0) {
    return <>{trimmed}</>;
  }

  return (
    <>
      {trimmed.slice(0, lastSpace)} <em>{trimmed.slice(lastSpace + 1)}</em>
    </>
  );
}

export function Masthead(props: {
  title: string;
  tagline: string | undefined;
  operatorAccess: DashboardOperatorAccess | undefined;
}): JSX.Element {
  const { title, tagline, operatorAccess } = props;

  return (
    <header class="masthead">
      <div class="masthead-topline">
        <div class="eyebrow">
          <span class="pulse"></span>Brain · Operator Console
        </div>
        {operatorAccess?.isOperator && (
          <a class="masthead-action" href={operatorAccess.logoutUrl}>
            Sign out
          </a>
        )}
      </div>
      <h1 class="brand">
        <BrandTitle title={title} />
      </h1>
      {tagline && <p class="sub-deck">{tagline}</p>}
    </header>
  );
}
