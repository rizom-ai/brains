/** @jsxImportSource react */
import type { JSX } from "react";

function brandParts(title: string): { lead: string; accent?: string } {
  const trimmed = title.trim();
  const split = trimmed.lastIndexOf(" ");
  if (split <= 0) return { lead: trimmed };
  return {
    lead: trimmed.slice(0, split),
    accent: trimmed.slice(split + 1),
  };
}

export function PublicHeader(props: {
  title: string;
  homeHref: string;
  askHref?: string | undefined;
  loginHref: string;
}): JSX.Element {
  const brand = brandParts(props.title);
  return (
    <header className="public-header" aria-label="Public brain">
      <a className="public-header-brand" href={props.homeHref}>
        <span className="public-header-mark" aria-hidden="true">
          {props.title.trim().slice(0, 1).toUpperCase() || "B"}
        </span>
        <strong>
          {brand.lead}
          {brand.accent ? <em> {brand.accent}</em> : null}
        </strong>
      </a>
      <nav className="public-header-actions" aria-label="Public actions">
        {props.askHref ? (
          <a className="public-header-ask" href={props.askHref}>
            Ask <span aria-hidden="true">→</span>
          </a>
        ) : null}
        <a className="public-header-sign-in" href={props.loginHref}>
          Sign in
        </a>
        <button
          id="climateToggle"
          className="public-header-climate"
          type="button"
          aria-label="Toggle climate"
        >
          ◐
        </button>
      </nav>
    </header>
  );
}
