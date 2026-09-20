/** @jsxImportSource react */
import { datetimeLocalValue, errorMessage } from "./ui-utils";
import * as stylex from "@stylexjs/stylex";
import { fieldStyles as f } from "./studio-fields.styles";
import { StudioStatus } from "./studio-status";
import {
  Button,
  Input,
  NativeSelect,
  Switch,
  Textarea,
} from "@brains/app-ui-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useRef, useState, type ReactElement } from "react";
import type { FieldDescriptor, ValidationIssue } from "./api";
import { uploadImage, type UploadImageResult } from "./mutations";
import { invalidateAfterUpload } from "./queries";
import { useStudioApi } from "./studio-api-context";

/** Host presentation only: never changes adapter body support or permissions. */
/**
 * Whether a type's schema models a publication lifecycle. Rows only wear a
 * draft/published chip when the distinction exists — system types like
 * prompts otherwise all read "draft".
 */
export function typeHasPublicationField(fields: FieldDescriptor[]): boolean {
  return fields.some(
    (field) =>
      field.name === "published" ||
      (field.name === "status" && field.options?.includes("published")),
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

/**
 * Image-reference widget: uploads go to the configured Studio upload API, which promotes the
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
  const api = useStudioApi();
  const uploadMutation = useMutation({
    mutationFn: (file: File): Promise<UploadImageResult> =>
      uploadImage(api, file),
    onSuccess: () => {
      void invalidateAfterUpload(queryClient);
    },
  });
  const current = typeof value === "string" && value.length > 0 ? value : null;
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const uploading = useRef(false);
  const startUpload = (file: File): void => {
    if (uploading.current) return;
    uploading.current = true;
    setSelectedFile(file);
    uploadMutation.mutate(file, {
      onSuccess: (result) => {
        onChange(result.entityId);
        setSelectedFile(null);
      },
      onSettled: () => {
        uploading.current = false;
      },
    });
  };

  return (
    <div {...stylex.props(f.field)} data-studio-field="image">
      <span {...stylex.props(f.label)}>
        {descriptor.label}
        <em {...stylex.props(f.kind)}>image entity</em>
      </span>
      {current && (
        <p {...stylex.props(f.imageRef)}>
          <code {...stylex.props(f.imageCode)}>{current}</code>
          <Button
            type="button"
            variant="link"
            size="xs"
            xstyle={f.clear}
            disabled={uploadMutation.isPending}
            onClick={() => {
              onChange("");
              setSelectedFile(null);
              uploadMutation.reset();
            }}
          >
            Clear
          </Button>
        </p>
      )}
      <label {...stylex.props(f.upload)}>
        <span {...stylex.props(f.glyph)} aria-hidden="true">
          ↑
        </span>
        <strong {...stylex.props(f.uploadTitle)}>Choose an image</strong>
        <small {...stylex.props(f.uploadNote)}>
          PNG, JPEG, GIF, WebP, AVIF, or SVG. Keep files below 10 MiB.
        </small>
        <input
          {...stylex.props(f.file)}
          type="file"
          accept="image/*"
          disabled={uploadMutation.isPending}
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = "";
            if (file) startUpload(file);
          }}
        />
      </label>
      <div role="status" aria-live="polite">
        {uploadMutation.isPending && (
          <StudioStatus>
            Uploading {selectedFile?.name}… Wait for the upload before saving
            this reference.
          </StudioStatus>
        )}
        {uploadMutation.isSuccess && (
          <StudioStatus tone="good">
            Uploaded {uploadMutation.variables.name}. Save changes to keep this
            reference.
          </StudioStatus>
        )}
      </div>
      {uploadMutation.error && (
        <StudioStatus tone="error">
          <span>
            {selectedFile?.name}: {errorMessage(uploadMutation.error)} Your
            previous image reference is unchanged.
            <br />
            Choose another file, or retry. If the previous upload reached the
            server, retrying may create another image.
            <br />
            {selectedFile && (
              <Button
                type="button"
                variant="outline"
                onClick={() => startUpload(selectedFile)}
              >
                Retry upload
              </Button>
            )}
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setSelectedFile(null);
                uploadMutation.reset();
              }}
            >
              Dismiss upload error
            </Button>
          </span>
        </StudioStatus>
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
    <div {...stylex.props(f.field)} data-studio-field="tags">
      <span {...stylex.props(f.label)}>
        {props.descriptor.label}
        <em {...stylex.props(f.kind)}>tags</em>
      </span>
      <div {...stylex.props(f.tags)}>
        {values.map((value) => (
          <span {...stylex.props(f.tag)} key={value}>
            {value}
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              xstyle={f.tagButton}
              aria-label={`Remove ${value}`}
              onClick={() =>
                props.onChange(values.filter((item) => item !== value))
              }
            >
              ×
            </Button>
          </span>
        ))}
        <span {...stylex.props(f.tag, f.tagAdd)}>
          <Input
            xstyle={f.tagInput}
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
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            xstyle={f.tagButton}
            aria-label="Add tag"
            onClick={add}
          >
            +
          </Button>
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
      <div {...stylex.props(f.suggestion)}>
        {Array.isArray(state.suggestion) ? (
          <span {...stylex.props(f.suggestionTags)}>
            {state.suggestion.map((tag) => (
              <code {...stylex.props(f.suggestionToken)} key={tag}>
                {tag}
              </code>
            ))}
          </span>
        ) : (
          <span {...stylex.props(f.suggestionCopy)}>{state.suggestion}</span>
        )}
        <Button
          type="button"
          size="xs"
          onClick={() => onApply(state.field, state.suggestion)}
        >
          Apply
        </Button>
        <Button type="button" variant="ghost" size="xs" onClick={onDiscard}>
          Discard
        </Button>
      </div>
    );
  }

  return (
    <div {...stylex.props(f.assist)}>
      <Button
        type="button"
        variant="outline"
        size="xs"
        disabled={active && state.kind === "loading"}
        onClick={() => onRun(variant, descriptor.name)}
      >
        {active && state.kind === "loading"
          ? "Thinking…"
          : variant === "summarise"
            ? "Summarise body"
            : `Suggest ${descriptor.label.toLowerCase()}`}
      </Button>
      {active && state.kind === "error" && (
        <StudioStatus inline tone="error">
          {state.message}
        </StudioStatus>
      )}
    </div>
  );
}

export function Field(props: {
  descriptor: FieldDescriptor;
  value: unknown;
  onChange: (raw: unknown) => void;
  issues?: ValidationIssue[] | undefined;
}): ReactElement {
  const errorId = useId();
  const group = useRef<HTMLDivElement>(null);
  const issues =
    props.issues?.filter((issue) => issue.path[0] === props.descriptor.name) ??
    [];
  useEffect(() => {
    const node = group.current;
    if (
      !node?.hasAttribute("data-studio-invalid-field") ||
      node !==
        node.closest("form")?.querySelector("[data-studio-invalid-field]")
    )
      return;
    const control = node.querySelector<HTMLElement>(
      'input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [role="switch"]:not([disabled])',
    );
    (control?.getAttribute("aria-describedby") === errorId
      ? control
      : node
    ).focus();
  }, [props.issues, errorId]);
  return (
    <div
      ref={group}
      role="group"
      aria-label={props.descriptor.label}
      tabIndex={-1}
      aria-describedby={issues.length ? errorId : undefined}
      data-studio-invalid-field={
        issues.length ? props.descriptor.name : undefined
      }
    >
      <FieldControl
        descriptor={props.descriptor}
        value={props.value}
        onChange={props.onChange}
        errorId={issues.length ? errorId : undefined}
      />
      {issues.length > 0 && (
        <div id={errorId}>
          <StudioStatus tone="error">
            Last save:{" "}
            {issues
              .map(
                (issue) =>
                  `${issue.path.length > 1 ? `${issue.path.slice(1).join(".")}: ` : ""}${issue.message}`,
              )
              .join(" · ")}
          </StudioStatus>
        </div>
      )}
    </div>
  );
}

function FieldControl(props: {
  descriptor: FieldDescriptor;
  value: unknown;
  onChange: (raw: unknown) => void;
  errorId: string | undefined;
}): ReactElement {
  const { descriptor, value, onChange, errorId } = props;
  const validation = {
    "aria-invalid": errorId ? true : undefined,
    "aria-describedby": errorId,
  };
  const required = descriptor.required !== false;
  const text =
    typeof value === "string" || typeof value === "number" ? String(value) : "";
  const label = (
    <span {...stylex.props(f.label)}>
      {descriptor.label}
      {required ? <em {...stylex.props(f.required)}>required</em> : null}
    </span>
  );

  if (descriptor.widget === "image") {
    return (
      <ImageField descriptor={descriptor} value={value} onChange={onChange} />
    );
  }

  if (descriptor.widget === "boolean") {
    return (
      <label {...stylex.props(f.field, f.inline)} data-studio-field="boolean">
        <span {...stylex.props(f.label, f.inlineLabel)}>
          {descriptor.label}
        </span>
        <Switch
          {...validation}
          checked={value === true}
          onCheckedChange={(checked) => onChange(checked)}
        />
      </label>
    );
  }

  if (descriptor.widget === "select") {
    return (
      <label {...stylex.props(f.field)} data-studio-field="select">
        {label}
        <NativeSelect
          {...validation}
          xstyle={f.control}
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
        </NativeSelect>
      </label>
    );
  }

  if (descriptor.widget === "text") {
    return (
      <label {...stylex.props(f.field)} data-studio-field="text">
        {label}
        <Textarea
          {...validation}
          xstyle={f.control}
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
      <label {...stylex.props(f.field)} data-studio-field="structured">
        <span {...stylex.props(f.label)}>
          {descriptor.label}
          <em {...stylex.props(f.kind)}>read-only</em>
        </span>
        <Textarea
          {...validation}
          xstyle={[f.control, f.readOnly]}
          value={JSON.stringify(value ?? null, null, 2)}
          disabled
          rows={4}
        />
      </label>
    );
  }

  return (
    <label {...stylex.props(f.field)} data-studio-field={descriptor.widget}>
      {label}
      <Input
        {...validation}
        xstyle={[f.control, descriptor.widget === "datetime" && f.date]}
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

// Navigation and type classification moved to studio-type-navigation.tsx.
// Re-exported here so the many call sites that reach for them through this
// module keep working; import from the navigation module in new code.
export type { StudioEditorPresentation } from "./studio-type-navigation";
export {
  StudioBrowseDestinations,
  TypeSwitcher,
  studioArea,
  studioEditorPresentation,
  studioMobileSelection,
} from "./studio-type-navigation";
