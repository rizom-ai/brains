/** @jsxImportSource react */
import * as stylex from "@stylexjs/stylex";
import { useEffect, useId, useRef, type ReactElement } from "react";
import type { FieldDescriptor, TypeSchema, ValidationIssue } from "./api";
import { headStyles } from "./studio-page-head.styles";
import type { StudioEditorPresentation } from "./studio-type-navigation";

/**
 * The field a document's heading edits in place: a plain `title` beside a
 * body. Forms and bodyless records keep their title among Properties.
 */
export function headingTitleField(
  schema: Pick<TypeSchema, "fields">,
  presentation: StudioEditorPresentation,
): FieldDescriptor | undefined {
  return presentation === "split"
    ? schema.fields.find(
        (field) => field.name === "title" && field.widget === "string",
      )
    : undefined;
}

/**
 * A document's title, edited as its heading. A rejected title takes part in
 * the form's invalid-field order like any Properties field: when it is the
 * first, it takes focus, and its message stays beside it.
 */
export function HeadingTitle(props: {
  descriptor: FieldDescriptor;
  value: string;
  placeholder: string;
  issues: readonly ValidationIssue[] | undefined;
  onChange: (value: string) => void;
}): ReactElement {
  const issueId = useId();
  const frame = useRef<HTMLSpanElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const issue = props.issues?.find(
    (entry) => entry.path[0] === props.descriptor.name,
  );
  useEffect(() => {
    const node = frame.current;
    if (
      !issue ||
      !node ||
      node !==
        node.closest("form")?.querySelector("[data-studio-invalid-field]")
    )
      return;
    input.current?.focus();
  }, [issue, props.issues]);
  return (
    <span ref={frame} {...(issue && { "data-studio-invalid-field": "" })}>
      <span data-value={props.value} {...stylex.props(headStyles.titleGrow)}>
        <textarea
          ref={input}
          rows={1}
          name={props.descriptor.name}
          aria-label={props.descriptor.label}
          value={props.value}
          required={props.descriptor.required !== false}
          placeholder={props.placeholder}
          aria-invalid={issue ? true : undefined}
          aria-describedby={issue ? issueId : undefined}
          // A title is one line: Enter does not break it, and a pasted
          // line break becomes a space.
          onKeyDown={(event) => {
            if (event.key === "Enter") event.preventDefault();
          }}
          onChange={(event) =>
            props.onChange(event.currentTarget.value.replace(/\r?\n/g, " "))
          }
          {...stylex.props(headStyles.titleInput)}
        />
      </span>
      {issue && (
        <span id={issueId} {...stylex.props(headStyles.titleIssue)}>
          {issue.message}
        </span>
      )}
    </span>
  );
}
