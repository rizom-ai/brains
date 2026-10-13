import type { JsonValue } from "@brains/contracts";
import type { UserPermissionLevel } from "@brains/templates";
import type { AnyWorkspaceActionDefinition } from "./workspace-action-definition-contract";
import type { WorkspaceActionFormFieldDefinition } from "./operator-view-contract";
import { meetsPermission } from "./contract-assertions";
import { z } from "@brains/utils/zod";
import {
  getKind,
  getObjectShape,
  readEnumValues,
  unwrapField,
} from "@brains/utils/zod-introspect";
import type {
  RuntimeWorkspaceActionFormField,
  RuntimeWorkspaceActionForm,
  RuntimeWorkspaceActionResult,
  RuntimeOperatorActionControl,
  RuntimeOperatorValidationIssue,
} from "./operator-view-runtime-types";

type SourceActionFormField = WorkspaceActionFormFieldDefinition;

export interface SourceActionControl {
  readonly action: AnyWorkspaceActionDefinition;
  readonly label?: string | undefined;
  readonly input?: unknown;
  readonly form?:
    | {
        readonly presentation?: "inline" | "disclosure" | undefined;
        readonly submitLabel?: string | undefined;
        readonly fields: Readonly<Record<string, SourceActionFormField>>;
      }
    | undefined;
  readonly result?:
    | {
        readonly title: string;
        readonly fields: Readonly<
          Record<
            string,
            {
              readonly label: string;
              readonly copyable?: boolean | undefined;
              readonly sensitive?: boolean | undefined;
            }
          >
        >;
      }
    | undefined;
  readonly capability?:
    | {
        readonly id: string;
        readonly label: string;
        readonly description?: string | undefined;
        readonly confirmation?: "prepared" | undefined;
      }
    | undefined;
  readonly disabled?: boolean | undefined;
}

const jsonValueSchema: ReturnType<typeof z.json> = z.json();

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function formControlSupportsSchema(
  control: SourceActionFormField["control"],
  schema: unknown,
): boolean {
  const kind = getKind(unwrapField(schema).inner);
  switch (control) {
    case "checkbox":
      return kind === "boolean";
    case "number":
      return kind === "number";
    case "select":
      return kind === "string" || kind === "enum";
    case "text":
    case "url":
      return kind === "string";
  }
}

function isScalarResultSchema(schema: unknown): boolean {
  const kind = getKind(unwrapField(schema).inner);
  return (
    kind === "string" ||
    kind === "number" ||
    kind === "boolean" ||
    kind === "enum" ||
    kind === "literal"
  );
}

function normalizeActionForm(
  control: SourceActionControl,
  actionPath: readonly PropertyKey[],
): {
  readonly input?: JsonValue | undefined;
  readonly form?: RuntimeWorkspaceActionForm | undefined;
  readonly issues: readonly RuntimeOperatorValidationIssue[];
} {
  if (!control.form) return { issues: [] };
  const issues: RuntimeOperatorValidationIssue[] = [];
  const shape = getObjectShape(control.action.input);
  if (!shape) {
    return {
      issues: [
        {
          path: [...actionPath, "form"],
          message: `Form action "${control.action.name}" requires an object input schema`,
        },
      ],
    };
  }
  const initial = control.input ?? {};
  if (!isPlainRecord(initial)) {
    return {
      issues: [
        {
          path: [...actionPath, "input"],
          message: "Workspace action form initial input must be an object",
        },
      ],
    };
  }
  const parsedInitial = jsonValueSchema.safeParse(initial);
  if (!parsedInitial.success) {
    return {
      issues: [
        {
          path: [...actionPath, "input"],
          message: "Workspace action form initial input must be JSON-native",
        },
      ],
    };
  }
  const schemaNames = Object.keys(shape);
  const fieldEntries = Object.entries(control.form.fields);
  if (fieldEntries.length > 50) {
    issues.push({
      path: [...actionPath, "form", "fields"],
      message: "Workspace action forms support at most 50 fields",
    });
  }
  for (const [name, value] of Object.entries(initial)) {
    const schema = shape[name];
    if (schema === undefined) {
      issues.push({
        path: [...actionPath, "input", name],
        message: `Form initial input "${name}" is not declared by the action schema`,
      });
    } else if (
      schema instanceof z.ZodType &&
      !schema.safeParse(value).success
    ) {
      issues.push({
        path: [...actionPath, "input", name],
        message: `Form initial input "${name}" does not satisfy the action schema`,
      });
    }
  }
  const runtimeFields: RuntimeWorkspaceActionFormField[] = [];
  for (const [name, field] of fieldEntries) {
    const schema = shape[name];
    if (schema === undefined) {
      issues.push({
        path: [...actionPath, "form", "fields", name],
        message: `Form field "${name}" is not declared by the action schema`,
      });
      continue;
    }
    const unwrapped = unwrapField(schema);
    const enumValues = readEnumValues(unwrapped.inner);
    if (!formControlSupportsSchema(field.control, schema)) {
      issues.push({
        path: [...actionPath, "form", "fields", name, "control"],
        message: `Form control "${field.control}" is incompatible with schema field "${name}"`,
      });
    }
    if (field.control === "select") {
      if (!field.options || field.options.length === 0) {
        issues.push({
          path: [...actionPath, "form", "fields", name, "options"],
          message: `Select field "${name}" requires options`,
        });
      } else if (enumValues) {
        if (
          field.options.some((option) => !enumValues.includes(option.value))
        ) {
          issues.push({
            path: [...actionPath, "form", "fields", name, "options"],
            message: `Select field "${name}" options must use values from its enum schema`,
          });
        }
      }
    } else if (field.options !== undefined) {
      issues.push({
        path: [...actionPath, "form", "fields", name, "options"],
        message: `Non-select field "${name}" cannot declare options`,
      });
    }
    if (field.labelBy) {
      const sourceField = control.form.fields[field.labelBy.field];
      const sourceValues = new Set(
        sourceField?.options?.map((option) => option.value) ?? [],
      );
      const labelValues = new Set(
        field.labelBy.values.map((option) => option.value),
      );
      if (sourceField?.control !== "select") {
        issues.push({
          path: [...actionPath, "form", "fields", name, "labelBy", "field"],
          message: `Dynamic label source "${field.labelBy.field}" must be a select form field`,
        });
      } else if (
        sourceValues.size !== labelValues.size ||
        Array.from(sourceValues).some((value) => !labelValues.has(value))
      ) {
        issues.push({
          path: [...actionPath, "form", "fields", name, "labelBy", "values"],
          message: `Dynamic labels for "${name}" must cover every option of "${field.labelBy.field}"`,
        });
      }
    }
    if (field.secret === true && name in initial) {
      issues.push({
        path: [...actionPath, "input", name],
        message: `Secret form field "${name}" cannot be pre-bound into browser data`,
      });
    }
    if (
      field.secret === true &&
      field.control !== "text" &&
      field.control !== "url"
    ) {
      issues.push({
        path: [...actionPath, "form", "fields", name, "secret"],
        message: `Secret field "${name}" must use a text or URL control`,
      });
    }
    runtimeFields.push({
      name,
      label: field.label,
      control: field.control,
      required: unwrapped.required,
      ...(field.secret ? { secret: true } : {}),
      ...(field.options ? { options: field.options } : {}),
      ...(field.labelBy ? { labelBy: field.labelBy } : {}),
    });
  }
  const rendered = new Set(fieldEntries.map(([name]) => name));
  for (const name of schemaNames) {
    if (!rendered.has(name) && !(name in initial)) {
      issues.push({
        path: [...actionPath, "form", "fields", name],
        message: `Action schema field "${name}" has no form declaration or pre-bound input`,
      });
    }
  }
  return {
    input: parsedInitial.data,
    form: {
      ...(control.form.presentation
        ? { presentation: control.form.presentation }
        : {}),
      ...(control.form.submitLabel
        ? { submitLabel: control.form.submitLabel }
        : {}),
      fields: runtimeFields,
    },
    issues,
  };
}

function normalizeActionResult(
  control: SourceActionControl,
  actionPath: readonly PropertyKey[],
): {
  readonly result?: RuntimeWorkspaceActionResult | undefined;
  readonly issues: readonly RuntimeOperatorValidationIssue[];
} {
  if (!control.result) return { issues: [] };
  const shape = getObjectShape(control.action.output);
  if (!shape) {
    return {
      issues: [
        {
          path: [...actionPath, "result"],
          message: `Presented result for "${control.action.name}" requires an object output schema`,
        },
      ],
    };
  }
  const issues: RuntimeOperatorValidationIssue[] = [];
  const fieldEntries = Object.entries(control.result.fields);
  if (fieldEntries.length > 50) {
    issues.push({
      path: [...actionPath, "result", "fields"],
      message: "Workspace action results support at most 50 fields",
    });
  }
  const declared = new Set(fieldEntries.map(([name]) => name));
  for (const [name, field] of fieldEntries) {
    const schema = shape[name];
    if (schema === undefined) {
      issues.push({
        path: [...actionPath, "result", "fields", name],
        message: `Result field "${name}" is not declared by the action output schema`,
      });
    } else if (!isScalarResultSchema(schema)) {
      issues.push({
        path: [...actionPath, "result", "fields", name],
        message: `Result field "${name}" must use a scalar output schema`,
      });
    }
    if (field.sensitive === true && field.copyable !== true) {
      issues.push({
        path: [...actionPath, "result", "fields", name, "copyable"],
        message: `Sensitive result field "${name}" must be explicitly copyable`,
      });
    }
  }
  for (const name of Object.keys(shape)) {
    if (!declared.has(name)) {
      issues.push({
        path: [...actionPath, "result", "fields", name],
        message: `Action output field "${name}" has no result declaration`,
      });
    }
  }
  return {
    result: {
      title: control.result.title,
      fields: fieldEntries.map(([name, field]) => ({
        name,
        label: field.label,
        ...(field.copyable ? { copyable: true } : {}),
        ...(field.sensitive ? { sensitive: true } : {}),
      })),
    },
    issues,
  };
}

export function normalizeActionControls(
  controls: readonly SourceActionControl[],
  declared: readonly AnyWorkspaceActionDefinition[],
  permission: UserPermissionLevel,
  path: readonly PropertyKey[],
  sourceIndices?: readonly PropertyKey[],
): {
  readonly controls: readonly RuntimeOperatorActionControl[];
  readonly issues: readonly RuntimeOperatorValidationIssue[];
} {
  const normalized: RuntimeOperatorActionControl[] = [];
  const issues: RuntimeOperatorValidationIssue[] = [];
  for (const [index, control] of controls.entries()) {
    const actionPath = [...path, sourceIndices?.[index] ?? index];
    if (!declared.includes(control.action)) {
      issues.push({
        path: [...actionPath, "action"],
        message: `Action "${control.action.name}" is not declared by this workspace`,
      });
      continue;
    }
    if (
      control.action.permission !== undefined &&
      !meetsPermission(permission, control.action.permission)
    ) {
      continue;
    }
    if (control.action.catalog === true && !control.capability) {
      issues.push({
        path: [...actionPath, "capability"],
        message: `Catalog action "${control.action.name}" requires a typed capability definition`,
      });
      continue;
    }
    if (control.action.catalog !== true && control.capability) {
      issues.push({
        path: [...actionPath, "capability"],
        message: `Action "${control.action.name}" is not a capability catalog`,
      });
      continue;
    }
    if (
      control.capability?.confirmation === "prepared" &&
      control.action.confirmation?.kind !== "prepared"
    ) {
      issues.push({
        path: [...actionPath, "capability", "confirmation"],
        message: `Capability "${control.capability.id}" requires a prepared catalog action`,
      });
      continue;
    }
    const normalizedForm = normalizeActionForm(control, actionPath);
    const normalizedResult = normalizeActionResult(control, actionPath);
    issues.push(...normalizedForm.issues, ...normalizedResult.issues);
    let actionInput: JsonValue | undefined;
    if (control.form) {
      actionInput = normalizedForm.input;
    } else {
      const parsedInput = control.action.input.safeParse(control.input);
      if (!parsedInput.success) {
        issues.push(
          ...parsedInput.error.issues.map((issue) => ({
            path: [...actionPath, "input", ...issue.path],
            message: issue.message,
          })),
        );
      } else {
        const jsonInput = jsonValueSchema.safeParse(parsedInput.data);
        if (!jsonInput.success) {
          issues.push({
            path: [...actionPath, "input"],
            message: "Workspace action input must be JSON-native",
          });
        } else {
          actionInput = jsonInput.data;
        }
      }
    }
    if (
      normalizedForm.issues.length > 0 ||
      normalizedResult.issues.length > 0 ||
      actionInput === undefined
    ) {
      continue;
    }
    const actionConfirmation = control.action.confirmation;
    const confirmation: RuntimeOperatorActionControl["confirmation"] =
      actionConfirmation?.kind === "static"
        ? actionConfirmation
        : actionConfirmation?.kind === "prepared" &&
            (actionConfirmation.conditional !== true ||
              control.capability?.confirmation === "prepared")
          ? { kind: "prepared" }
          : undefined;
    normalized.push(
      Object.freeze({
        actionId: control.action.name,
        ...(control.capability ? { capabilityId: control.capability.id } : {}),
        label:
          control.label ?? control.capability?.label ?? control.action.label,
        input: actionInput,
        ...(normalizedForm.form ? { form: normalizedForm.form } : {}),
        ...(normalizedResult.result ? { result: normalizedResult.result } : {}),
        ...(control.disabled ? { disabled: true } : {}),
        ...(confirmation ? { confirmation } : {}),
      }),
    );
  }
  return { controls: normalized, issues };
}
