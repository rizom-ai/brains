/** @jsxImportSource react */
import * as stylex from "@stylexjs/stylex";
import type { ReactElement } from "react";
import { fieldStyles as f } from "./studio-fields.styles";
import { SystemReadOnlyValue } from "./read-only-value";

const ISO_DATETIME = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/;

/** A fact as a reader takes it in, or nothing when there is none. */
function moment(value: string): string | undefined {
  const time = ISO_DATETIME.exec(value);
  return time ? `${time[1]} ${time[2]} UTC` : undefined;
}

function fact(name: string, value: unknown): string | undefined {
  if (typeof value === "string") {
    if (value.length === 0) return undefined;
    const time = moment(value);
    if (time) return time;
    // The origin is a kind, not an id: it reads as a word.
    return name === "origin"
      ? value.charAt(0).toUpperCase() + value.slice(1)
      : value;
  }
  if (typeof value === "number" || typeof value === "boolean")
    return String(value);
  if (typeof value === "object" && value !== null) {
    const entityType: unknown = Reflect.get(value, "entityType");
    const entityId: unknown = Reflect.get(value, "entityId");
    if (typeof entityType === "string" && typeof entityId === "string")
      return `${entityType} · ${entityId}`;
    const start: unknown = Reflect.get(value, "start");
    const end: unknown = Reflect.get(value, "end");
    if (typeof start === "string" && typeof end === "string")
      return `${moment(start) ?? start} → ${moment(end) ?? end}`;
  }
  return undefined;
}

/** Where an entry came from: read-only, and absent when unknown. */
export function ProvenanceFact(props: {
  name: string;
  label: string;
  value: unknown;
}): ReactElement | null {
  const text = fact(props.name, props.value);
  const structured =
    text === undefined && hasContent(props.value) ? props.value : undefined;
  if (text === undefined && structured === undefined) return null;
  return (
    <div {...stylex.props(f.field)} data-studio-field="provenance">
      <div {...stylex.props(f.label)}>
        <span>{props.label}</span>
      </div>
      {text !== undefined ? (
        <span>{text}</span>
      ) : (
        <SystemReadOnlyValue value={structured} />
      )}
    </div>
  );
}

/** A list or object holding anything worth showing. */
function hasContent(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0;
  return (
    typeof value === "object" &&
    value !== null &&
    Object.values(value).some((item) => item !== undefined && item !== null)
  );
}
