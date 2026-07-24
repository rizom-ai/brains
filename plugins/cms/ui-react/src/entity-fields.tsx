import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type ReactElement } from "react";
import type { CmsWorkspaceInfo, EntityTypeInfo, FieldDescriptor } from "./api";
import { uploadImage } from "./mutations";
import { invalidateAfterUpload } from "./queries";
import { datetimeLocalValue, errorMessage } from "./ui-utils";

const COLLECTION_ENTITY_TYPES = new Set([
  "project",
  "projects",
  "series",
  "topic",
  "topics",
]);
const SITE_ENTITY_TYPES = new Set([
  "profile",
  "settings",
  "site-info",
  "siteInfo",
]);
// Brain machinery: operator-editable, but not authored content. These live
// in their own rail group so a full brain doesn't flood "Content".
const SYSTEM_ENTITY_TYPES = new Set([
  "agent",
  "agents",
  "anchor-profile",
  "brain-character",
  "playbook",
  "playbooks",
  "prompt",
  "prompts",
  "skill",
  "skills",
  "swot",
  "swots",
]);

function cmsTypeGroup(
  entityType: string,
): "Content" | "Collections" | "Site" | "System" {
  if (SITE_ENTITY_TYPES.has(entityType)) return "Site";
  if (SYSTEM_ENTITY_TYPES.has(entityType)) return "System";
  if (COLLECTION_ENTITY_TYPES.has(entityType)) return "Collections";
  return "Content";
}

/**
 * Whether a type's schema models a publication lifecycle. Rows only wear a
 * draft/published chip when the distinction exists — system types like
 * prompts otherwise all read "draft".
 */
export function typeHasPublicationField(fields: FieldDescriptor[]): boolean {
  return fields.some(
    (field) => field.name === "status" || field.name === "published",
  );
}

export function isFieldVisible(
  field: FieldDescriptor,
  values: Record<string, unknown>,
): boolean {
  if (!field.condition) return true;
  const expected = field.condition.value;
  const actual = values[field.condition.field];
  return Array.isArray(expected)
    ? expected.some((value) => value === actual)
    : expected === actual;
}

export function visibleFieldValues(
  fields: FieldDescriptor[],
  values: Record<string, unknown>,
): Record<string, unknown> {
  const hiddenFields = new Set(
    fields
      .filter((field) => !isFieldVisible(field, values))
      .map((field) => field.name),
  );
  return Object.fromEntries(
    Object.entries(values).filter(([name]) => !hiddenFields.has(name)),
  );
}

export function TypeSwitcher(props: {
  types: EntityTypeInfo[];
  active: string | null;
  onSelect: (entityType: string) => void;
  workspaces?: CmsWorkspaceInfo[];
  activeWorkspace?: string | null;
  workspaceBadges?: Record<string, number>;
  onSelectWorkspace?: (workspaceId: string) => void;
}): ReactElement {
  const groups = (["Content", "Collections", "Site", "System"] as const)
    .map((label) => ({
      label,
      types: props.types.filter(
        (info) => cmsTypeGroup(info.entityType) === label,
      ),
    }))
    .filter((group) => group.types.length > 0);
  const renderGroup = (group: (typeof groups)[number]): ReactElement => (
    <section className="rail-group" key={group.label}>
      <div className="rail-title">{group.label}</div>
      <ul>
        {group.types.map((info) => (
          <li key={info.entityType}>
            <button
              type="button"
              className={
                info.entityType === props.active ? "type active" : "type"
              }
              onClick={() => props.onSelect(info.entityType)}
            >
              {info.label}
              {info.isSingleton ? (
                <span className="singleton-mark">solo</span>
              ) : (
                <span className="count">{info.count}</span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );

  return (
    <nav className="types">
      {groups
        .filter(
          (group) => group.label === "Content" || group.label === "Collections",
        )
        .map(renderGroup)}
      {(props.workspaces?.length ?? 0) > 0 && (
        <section className="rail-group rail-group--operations">
          <div className="rail-title">Operations</div>
          <ul>
            {props.workspaces?.map((workspace) => (
              <li key={workspace.id}>
                <button
                  type="button"
                  className={
                    workspace.id === props.activeWorkspace
                      ? "type workspace-type active"
                      : "type workspace-type"
                  }
                  onClick={() => props.onSelectWorkspace?.(workspace.id)}
                >
                  {workspace.label}
                  {(props.workspaceBadges?.[workspace.id] ?? 0) > 0 && (
                    <span className="count count--attention">
                      {props.workspaceBadges?.[workspace.id]}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {groups
        .filter((group) => group.label === "Site" || group.label === "System")
        .map(renderGroup)}
    </nav>
  );
}

/**
 * Image-reference widget: uploads go to the configured CMS upload API, which promotes the
 * bytes into an `image` entity through the owning plugin's pipeline; the
 * field stores the resulting entity id.
 */
function ImageField(props: {
  descriptor: FieldDescriptor;
  value: unknown;
  onChange: (raw: string) => void;
}): ReactElement {
  const { descriptor, value, onChange } = props;
  const queryClient = useQueryClient();
  const uploadMutation = useMutation({ mutationFn: uploadImage });
  const current = typeof value === "string" && value.length > 0 ? value : null;

  return (
    <div className="field field-image">
      <span className="field-label">
        {descriptor.label}
        <em className="kind">image entity</em>
      </span>
      {current && (
        <p className="image-ref">
          <code>{current}</code>
          <button type="button" onClick={() => onChange("")}>
            Clear
          </button>
        </p>
      )}
      <label className="upload-zone">
        <span className="upload-glyph" aria-hidden="true">
          ↑
        </span>
        <strong>Choose an image</strong>
        <small>PNG, JPEG, GIF, WebP, AVIF, or SVG</small>
        <input
          type="file"
          accept="image/*"
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            if (!file) return;
            uploadMutation.mutate(file, {
              onSuccess: (result) => {
                onChange(result.entityId);
                void invalidateAfterUpload(queryClient);
              },
            });
          }}
        />
      </label>
      {uploadMutation.isPending && <p className="status">Uploading…</p>}
      {uploadMutation.error && (
        <p className="status status-error">
          {errorMessage(uploadMutation.error)}
        </p>
      )}
    </div>
  );
}

function StringListField(props: {
  descriptor: FieldDescriptor;
  value: unknown;
  onChange: (raw: string[]) => void;
}): ReactElement {
  const [pending, setPending] = useState("");
  const values = Array.isArray(props.value)
    ? props.value.filter((item): item is string => typeof item === "string")
    : [];
  const add = (): void => {
    const next = pending.trim();
    if (next && !values.includes(next)) props.onChange([...values, next]);
    setPending("");
  };

  return (
    <div className="field field-tags">
      <span className="field-label">
        {props.descriptor.label}
        <em className="kind">tags</em>
      </span>
      <div className="tags">
        {values.map((value) => (
          <span className="tag" key={value}>
            {value}
            <button
              type="button"
              aria-label={`Remove ${value}`}
              onClick={() =>
                props.onChange(values.filter((item) => item !== value))
              }
            >
              ×
            </button>
          </span>
        ))}
        <span className="tag tag-add">
          <input
            type="text"
            value={pending}
            aria-label={`Add ${props.descriptor.label.toLowerCase()} tag`}
            placeholder="Add tag"
            onChange={(event) => setPending(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === ",") {
                event.preventDefault();
                add();
              }
            }}
          />
          <button type="button" aria-label="Add tag" onClick={add}>
            +
          </button>
        </span>
      </div>
    </div>
  );
}

export type FieldAssistVariant = "summarise" | "tag-suggest";

export type FieldAssistState =
  | { kind: "idle" }
  | { kind: "loading"; field: string; variant: FieldAssistVariant }
  | {
      kind: "suggested";
      field: string;
      variant: FieldAssistVariant;
      suggestion: string | string[];
    }
  | { kind: "error"; field: string; message: string };

export function fieldAssistVariant(
  descriptor: FieldDescriptor,
): FieldAssistVariant | null {
  if (descriptor.widget === "text") return "summarise";
  if (descriptor.widget === "list" && descriptor.field?.widget === "string") {
    return "tag-suggest";
  }
  return null;
}

export function applyFieldAssistSuggestion(
  draft: Record<string, unknown>,
  field: string,
  suggestion: string | string[],
): Record<string, unknown> {
  return { ...draft, [field]: suggestion };
}

export function FieldAssistControls(props: {
  descriptor: FieldDescriptor;
  state: FieldAssistState;
  onRun: (variant: FieldAssistVariant, field: string) => void;
  onApply: (field: string, suggestion: string | string[]) => void;
  onDiscard: () => void;
}): ReactElement | null {
  const { descriptor, state, onRun, onApply, onDiscard } = props;
  const variant = fieldAssistVariant(descriptor);
  if (!variant) return null;
  const active = "field" in state && state.field === descriptor.name;

  if (active && state.kind === "suggested") {
    return (
      <div className="field-assist-suggestion">
        {Array.isArray(state.suggestion) ? (
          <span className="field-assist-tags">
            {state.suggestion.map((tag) => (
              <code key={tag}>{tag}</code>
            ))}
          </span>
        ) : (
          <span className="field-assist-copy">{state.suggestion}</span>
        )}
        <button
          type="button"
          className="field-assist-action"
          onClick={() => onApply(state.field, state.suggestion)}
        >
          Apply
        </button>
        <button
          type="button"
          className="field-assist-action ghost"
          onClick={onDiscard}
        >
          Discard
        </button>
      </div>
    );
  }

  return (
    <div className="field-assist-controls">
      <button
        type="button"
        className="field-assist-run"
        disabled={active && state.kind === "loading"}
        onClick={() => onRun(variant, descriptor.name)}
      >
        {active && state.kind === "loading"
          ? "Thinking…"
          : variant === "summarise"
            ? "Summarise body"
            : `Suggest ${descriptor.label.toLowerCase()}`}
      </button>
      {active && state.kind === "error" && (
        <span className="status status-error">{state.message}</span>
      )}
    </div>
  );
}

export function Field(props: {
  descriptor: FieldDescriptor;
  value: unknown;
  onChange: (raw: unknown) => void;
}): ReactElement {
  const { descriptor, value, onChange } = props;
  const required = descriptor.required !== false;
  const text =
    typeof value === "string" || typeof value === "number" ? String(value) : "";
  const label = (
    <span className="field-label">
      {descriptor.label}
      {required ? (
        <em className="req">required</em>
      ) : (
        <em className="kind">{descriptor.widget}</em>
      )}
    </span>
  );

  if (descriptor.widget === "image") {
    return (
      <ImageField descriptor={descriptor} value={value} onChange={onChange} />
    );
  }

  if (descriptor.widget === "boolean") {
    return (
      <label className="field field-inline">
        <span className="field-label">{descriptor.label}</span>
        <input
          type="checkbox"
          checked={value === true}
          onChange={(event) => onChange(event.currentTarget.checked)}
        />
      </label>
    );
  }

  if (descriptor.widget === "select") {
    return (
      <label className="field">
        {label}
        <select
          value={text}
          required={required}
          onChange={(event) => onChange(event.currentTarget.value)}
        >
          <option value="">—</option>
          {(descriptor.options ?? []).map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>
    );
  }

  if (descriptor.widget === "text") {
    return (
      <label className="field">
        {label}
        <textarea
          value={text}
          required={required}
          rows={4}
          onChange={(event) => onChange(event.currentTarget.value)}
        />
      </label>
    );
  }

  if (descriptor.widget === "list" && descriptor.field?.widget === "string") {
    return (
      <StringListField
        descriptor={descriptor}
        value={value}
        onChange={onChange}
      />
    );
  }

  if (descriptor.widget === "list" || descriptor.widget === "object") {
    // Nested structured widgets remain read-only; the value round-trips
    // untouched because saves only send changed draft keys.
    return (
      <label className="field">
        <span className="field-label">
          {descriptor.label}
          <em className="kind">read-only</em>
        </span>
        <textarea
          value={JSON.stringify(value ?? null, null, 2)}
          disabled
          rows={4}
        />
      </label>
    );
  }

  return (
    <label className="field">
      {label}
      <input
        type={
          descriptor.widget === "number"
            ? "number"
            : descriptor.widget === "datetime"
              ? "datetime-local"
              : "text"
        }
        value={
          descriptor.widget === "datetime" ? datetimeLocalValue(text) : text
        }
        required={required}
        onChange={(event) =>
          onChange(
            descriptor.widget === "datetime" && event.currentTarget.value
              ? new Date(event.currentTarget.value).toISOString()
              : event.currentTarget.value,
          )
        }
      />
    </label>
  );
}
