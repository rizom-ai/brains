/** @jsxImportSource react */
import type { ReactElement } from "react";
import * as stylex from "@stylexjs/stylex";
import { Button, Input } from "@brains/app-ui-react";
import { searchStyles as search } from "./studio-search.styles";

/**
 * A live search field. Queries apply as they are typed — the caller debounces —
 * so there is no submit button to press and no state where the field disagrees
 * with the list below it. The label is carried by the field rather than by a
 * line of its own, and the clear control replaces the browser's own.
 */
export function StudioSearchField(props: {
  label: string;
  placeholder: string;
  value: string;
  hook?: string;
  wide?: boolean;
  onChange: (value: string) => void;
}): ReactElement {
  const applied = stylex.props(
    search.field,
    props.wide === true && search.wide,
  );
  return (
    <div
      className={`${props.hook ?? ""} ${applied.className ?? ""}`.trim()}
      style={applied.style}
      data-studio-search=""
    >
      <svg
        {...stylex.props(search.glyph)}
        viewBox="0 0 16 16"
        aria-hidden="true"
        focusable="false"
      >
        <circle
          cx="6.8"
          cy="6.8"
          r="4.4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
        />
        <line
          x1="10.2"
          y1="10.2"
          x2="14"
          y2="14"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </svg>
      <Input
        xstyle={[search.input, props.value.length > 0 && search.roomy]}
        type="search"
        aria-label={props.label}
        placeholder={props.placeholder}
        maxLength={200}
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
      />
      {props.value.length > 0 && (
        <Button
          type="button"
          variant="ghost"
          xstyle={search.clear}
          aria-label={`Clear ${props.label.toLowerCase()}`}
          onClick={() => props.onChange("")}
        >
          ×
        </Button>
      )}
    </div>
  );
}
