/** @jsxImportSource react */
import * as stylex from "@stylexjs/stylex";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  type ReactElement,
  type ReactNode,
} from "react";
import type { FieldDescriptor, ValidationIssue } from "./api";
import { applyFieldChange } from "./editor-workflow";
import { Field, isFieldVisible } from "./entity-fields";
import { GroupingValue } from "./grouping-vocabulary-fields";
import type { GroupingVocabulary } from "../../src/grouping-vocabulary-contract";
import { isRecord } from "@brains/utils/is-record";
import { StudioStatus } from "./studio-status";
import { systemFieldStyles as s } from "./studio-system-fields.styles";

const pairedLists = new Set(["preferredTerms", "preferred", "avoid"]);
const longFields = new Set([
  "description",
  "purpose",
  "positioning",
  "summary",
  "artDirection",
  "composition",
]);
function presentedField(field: FieldDescriptor): FieldDescriptor {
  return field.widget === "string" && longFields.has(field.name)
    ? { ...field, widget: "text" }
    : field;
}

export function SystemReadOnlyValue({
  value,
  fields,
  literalStrings,
  vocabulary,
}: {
  vocabulary?: GroupingVocabulary | undefined;
  literalStrings?: boolean | undefined;
  value: unknown;
  fields?: FieldDescriptor[] | undefined;
}): ReactElement {
  if (literalStrings && typeof value === "string")
    return <GroupingValue value={value} vocabulary={vocabulary} />;
  if (value === undefined || value === null || value === "")
    return <span>Not set</span>;
  if (Array.isArray(value))
    return value.length ? (
      <ul {...stylex.props(s.list)}>
        {value.map((item, index) => (
          <li key={index}>
            <SystemReadOnlyValue
              value={item}
              fields={fields}
              literalStrings={literalStrings}
              vocabulary={vocabulary}
            />
          </li>
        ))}
      </ul>
    ) : (
      <span>None</span>
    );
  if (isRecord(value))
    return (
      <dl {...stylex.props(s.profile)}>
        {Object.entries(value).map(([key, item]) => (
          <div key={key} {...stylex.props(s.row)}>
            <dt {...stylex.props(s.term)}>
              {fields?.find((field) => field.name === key)?.label ?? key}
            </dt>
            <dd {...stylex.props(s.value)}>
              <SystemReadOnlyValue
                value={item}
                fields={fields?.find((field) => field.name === key)?.fields}
              />
            </dd>
          </div>
        ))}
      </dl>
    );
  if (typeof value === "string" && /^https?:\/\//.test(value))
    return (
      <a href={value} {...stylex.props(s.link)}>
        {value}
      </a>
    );
  return (
    <span>
      {typeof value === "boolean" ? (value ? "Yes" : "No") : String(value)}
    </span>
  );
}

export function StudioSystemFields(props: {
  vocabularies?: Record<string, GroupingVocabulary> | undefined;
  literalFields?: readonly string[] | undefined;
  suggestions?: Record<string, readonly string[]> | undefined;
  fields: FieldDescriptor[];
  draft: Record<string, unknown>;
  title: string;
  readOnly: boolean;
  issues?: ValidationIssue[] | undefined;
  onChange: (descriptor: FieldDescriptor, value: unknown) => void;
  renderAssist?: ((descriptor: FieldDescriptor) => ReactNode) | undefined;
}): ReactElement | null {
  const fields = props.fields.filter(
    (field) =>
      isFieldVisible(field, props.draft) &&
      (!props.readOnly ||
        props.draft[field.name] !== undefined ||
        field.required !== false),
  );
  if (fields.length === 0) return null;
  if (props.readOnly)
    return (
      <div data-studio-system-fields="" {...stylex.props(s.root)}>
        {props.title && <h2 {...stylex.props(s.heading)}>{props.title}</h2>}
        <dl {...stylex.props(s.profile)}>
          {fields.map((field) => (
            <div key={field.name} {...stylex.props(s.row)}>
              <dt {...stylex.props(s.term)}>{field.label}</dt>
              <dd {...stylex.props(s.value)}>
                <SystemReadOnlyValue
                  vocabulary={props.vocabularies?.[field.name]}
                  literalStrings={props.literalFields?.includes(field.name)}
                  value={props.draft[field.name]}
                  fields={field.fields}
                />
              </dd>
            </div>
          ))}
        </dl>
      </div>
    );
  const grouped = fields.filter(
    (field) => field.widget === "object" && field.fields?.length,
  );
  const simple = fields.filter(
    (field) => !grouped.includes(field) && field.name !== "visibility",
  );
  const access = fields.filter((field) => field.name === "visibility");
  const render = (field: FieldDescriptor): ReactElement => (
    <SystemField
      vocabulary={props.vocabularies?.[field.name]}
      literalList={props.literalFields?.includes(field.name)}
      suggestions={props.suggestions?.[field.name]}
      key={field.name}
      descriptor={field}
      value={props.draft[field.name]}
      issues={props.issues}
      onChange={(value) => props.onChange(field, value)}
    >
      {props.renderAssist?.(field)}
    </SystemField>
  );
  return (
    <div data-studio-system-fields="" {...stylex.props(s.root)}>
      {simple.length > 0 && (
        <>
          {props.title && <h2 {...stylex.props(s.heading)}>{props.title}</h2>}
          <div data-studio-system-grid="" {...stylex.props(s.grid)}>
            {simple.map(render)}
          </div>
        </>
      )}
      {grouped.map(render)}
      {access.length > 0 && (
        <section {...stylex.props(s.section)}>
          <h2 {...stylex.props(s.heading)}>Access</h2>
          <div data-studio-system-grid="" {...stylex.props(s.grid)}>
            {access.map(render)}
          </div>
        </section>
      )}
    </div>
  );
}

function SystemField(props: {
  vocabulary?: GroupingVocabulary | undefined;
  literalList?: boolean | undefined;
  suggestions?: readonly string[] | undefined;
  descriptor: FieldDescriptor;
  value: unknown;
  issues?: ValidationIssue[] | undefined;
  onChange: (value: unknown) => void;
  children?: ReactNode;
}): ReactElement {
  const descriptor = presentedField(props.descriptor);
  if (descriptor.widget === "object" && descriptor.fields?.length)
    return <SystemObjectField {...props} />;
  if (descriptor.widget === "list" && descriptor.fields?.length)
    return <SystemStructuredList {...props} />;
  return (
    <div
      {...stylex.props(
        s.onlyField,
        (descriptor.widget === "text" ||
          (descriptor.widget === "list" && !pairedLists.has(descriptor.name)) ||
          descriptor.widget === "object" ||
          descriptor.widget === "image") &&
          s.wide,
      )}
      data-studio-field-assist=""
    >
      <Field
        vocabulary={props.vocabulary}
        literalList={props.literalList}
        suggestions={props.suggestions}
        descriptor={descriptor}
        value={props.value}
        issues={props.issues}
        onChange={props.onChange}
      />
      {props.children}
    </div>
  );
}

// Complex lists remain read-only, just like the existing Field widget. Improve
// their presentation without inventing list mutations or changing stored values.
function SystemStructuredList(props: {
  descriptor: FieldDescriptor;
  value: unknown;
  issues?: ValidationIssue[] | undefined;
}): ReactElement {
  const errors = useMemo(
    () =>
      props.issues?.filter(
        (issue) => issue.path[0] === props.descriptor.name,
      ) ?? [],
    [props.issues, props.descriptor.name],
  );
  const ref = useRef<HTMLDivElement>(null);
  const errorId = useId();
  useEffect(() => {
    const node = ref.current;
    if (
      errors.length &&
      node ===
        node?.closest("form")?.querySelector("[data-studio-invalid-field]")
    )
      node?.focus();
  }, [errors]);
  return (
    <div
      ref={ref}
      role="group"
      aria-label={props.descriptor.label}
      tabIndex={-1}
      data-studio-invalid-field={
        errors.length ? props.descriptor.name : undefined
      }
      aria-describedby={errors.length ? errorId : undefined}
      {...stylex.props(s.wide)}
    >
      <h2 {...stylex.props(s.heading)}>{props.descriptor.label}</h2>
      <SystemReadOnlyValue
        value={props.value}
        fields={props.descriptor.fields}
      />
      <p {...stylex.props(s.description)}>Read-only structured field</p>
      {errors.length > 0 && (
        <div id={errorId}>
          <StudioStatus tone="error">
            {errors.map((issue) => issue.message).join(" · ")}
          </StudioStatus>
        </div>
      )}
    </div>
  );
}

function SystemObjectField(props: {
  descriptor: FieldDescriptor;
  value: unknown;
  issues?: ValidationIssue[] | undefined;
  onChange: (value: unknown) => void;
}): ReactElement {
  const { descriptor } = props;
  const value = isRecord(props.value) ? props.value : {};
  const children = descriptor.fields ?? [];
  const issues = useMemo(
    () =>
      props.issues
        ?.filter((issue) => issue.path[0] === descriptor.name)
        .map((issue) => ({ ...issue, path: issue.path.slice(1) })),
    [props.issues, descriptor.name],
  );
  const ownErrors = issues?.filter((issue) => issue.path.length === 0) ?? [];
  const errorId = useId();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = ref.current;
    if (
      node?.hasAttribute("data-studio-invalid-field") &&
      node ===
        node.closest("form")?.querySelector("[data-studio-invalid-field]")
    )
      node.focus();
  }, [issues]);
  const extra = Object.fromEntries(
    Object.entries(value).filter(
      ([key]) => !children.some((field) => field.name === key),
    ),
  );
  return (
    <div
      ref={ref}
      role="group"
      aria-label={descriptor.label}
      tabIndex={-1}
      data-studio-invalid-field={ownErrors.length ? descriptor.name : undefined}
      aria-describedby={ownErrors.length ? errorId : undefined}
      {...stylex.props(s.section, s.wide)}
    >
      <h2 {...stylex.props(s.heading)}>{descriptor.label}</h2>
      {ownErrors.length > 0 && (
        <div id={errorId}>
          <StudioStatus tone="error">
            {ownErrors.map((issue) => issue.message).join(" · ")}
          </StudioStatus>
        </div>
      )}
      <div data-studio-system-grid="" {...stylex.props(s.grid)}>
        {children
          .filter((field) => isFieldVisible(field, value))
          .map((field) => (
            <SystemField
              key={field.name}
              descriptor={
                descriptor.required === false && props.value === undefined
                  ? { ...field, required: false }
                  : field
              }
              value={value[field.name]}
              issues={issues}
              onChange={(raw) =>
                props.onChange(applyFieldChange(value, field, raw))
              }
            />
          ))}
      </div>
      {Object.keys(extra).length > 0 && <SystemReadOnlyValue value={extra} />}
    </div>
  );
}
