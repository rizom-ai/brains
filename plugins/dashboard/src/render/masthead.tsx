/** @jsxImportSource preact */
import type { JSX } from "preact";

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
}): JSX.Element {
  const { title, tagline } = props;

  return (
    <header class="masthead">
      <div class="eyebrow">
        <span class="pulse"></span>Brain · Operator Console
      </div>
      <h1 class="brand">
        <BrandTitle title={title} />
      </h1>
      {tagline && <p class="sub-deck">{tagline}</p>}
    </header>
  );
}
