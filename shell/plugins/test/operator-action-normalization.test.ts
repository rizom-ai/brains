import { describe, expect, it } from "bun:test";
import { z } from "@brains/utils/zod";
import {
  defineWorkspaceAction,
  safeParseRuntimeStudioOperatorView,
} from "../src";
import {
  formFieldIssues,
  type FormFieldIssueContext,
} from "../src/operator/operator-action-normalization";
import type { WorkspaceActionFormFieldDefinition } from "../src/operator/operator-view-contract";

function issuesOf(
  name: string,
  schema: unknown,
  fields: FormFieldIssueContext["fields"],
  initial: FormFieldIssueContext["initial"] = {},
): readonly unknown[] {
  const field: WorkspaceActionFormFieldDefinition | undefined = fields[name];
  if (!field) throw new Error(`No field "${name}"`);
  return formFieldIssues(name, field, schema, {
    fields,
    initial,
    actionPath: ["blocks", 0],
  });
}

const role = z.enum(["admin", "trusted"]);
const options = [
  { value: "admin", label: "Admin" },
  { value: "trusted", label: "Trusted" },
];

describe("formFieldIssues", () => {
  it("accepts a field whose control fits its schema", () => {
    expect(
      issuesOf("name", z.string().optional(), {
        name: { label: "Name", control: "text" },
      }),
    ).toEqual([]);
    expect(
      issuesOf("role", role, {
        role: { label: "Role", control: "select", options },
      }),
    ).toEqual([]);
  });

  it("rejects a control its schema cannot hold", () => {
    expect(
      issuesOf("name", z.string(), {
        name: { label: "Name", control: "checkbox" },
      }),
    ).toEqual([
      {
        path: ["blocks", 0, "form", "fields", "name", "control"],
        message:
          'Form control "checkbox" is incompatible with schema field "name"',
      },
    ]);
  });

  it("requires select options, drawn from an enum schema's values", () => {
    expect(
      issuesOf("role", role, { role: { label: "Role", control: "select" } }),
    ).toEqual([
      {
        path: ["blocks", 0, "form", "fields", "role", "options"],
        message: 'Select field "role" requires options',
      },
    ]);
    expect(
      issuesOf("role", role, {
        role: {
          label: "Role",
          control: "select",
          options: [{ value: "owner", label: "Owner" }],
        },
      }),
    ).toEqual([
      {
        path: ["blocks", 0, "form", "fields", "role", "options"],
        message:
          'Select field "role" options must use values from its enum schema',
      },
    ]);
    expect(
      issuesOf("role", z.string(), {
        role: {
          label: "Role",
          control: "select",
          options: [{ value: "owner", label: "Owner" }],
        },
      }),
    ).toEqual([]);
  });

  it("rejects options on a non-select field", () => {
    expect(
      issuesOf("name", z.string(), {
        name: { label: "Name", control: "text", options },
      }),
    ).toEqual([
      {
        path: ["blocks", 0, "form", "fields", "name", "options"],
        message: 'Non-select field "name" cannot declare options',
      },
    ]);
  });

  it("requires a dynamic label to come from a select covering every option", () => {
    const labelBy = {
      field: "type",
      values: [{ value: "email", label: "Email address" }],
    };

    expect(
      issuesOf("subject", z.string(), {
        type: { label: "Type", control: "text" },
        subject: { label: "Subject", control: "text", labelBy },
      }),
    ).toEqual([
      {
        path: ["blocks", 0, "form", "fields", "subject", "labelBy", "field"],
        message: 'Dynamic label source "type" must be a select form field',
      },
    ]);
    expect(
      issuesOf("subject", z.string(), {
        type: {
          label: "Type",
          control: "select",
          options: [
            { value: "email", label: "Email" },
            { value: "discord", label: "Discord" },
          ],
        },
        subject: { label: "Subject", control: "text", labelBy },
      }),
    ).toEqual([
      {
        path: ["blocks", 0, "form", "fields", "subject", "labelBy", "values"],
        message:
          'Dynamic labels for "subject" must cover every option of "type"',
      },
    ]);
  });

  it("keeps secrets out of browser data and in text controls, after the other checks", () => {
    expect(
      issuesOf(
        "token",
        z.string(),
        { token: { label: "Token", control: "number", secret: true, options } },
        { token: "pre-bound" },
      ),
    ).toEqual([
      {
        path: ["blocks", 0, "form", "fields", "token", "control"],
        message:
          'Form control "number" is incompatible with schema field "token"',
      },
      {
        path: ["blocks", 0, "form", "fields", "token", "options"],
        message: 'Non-select field "token" cannot declare options',
      },
      {
        path: ["blocks", 0, "input", "token"],
        message:
          'Secret form field "token" cannot be pre-bound into browser data',
      },
      {
        path: ["blocks", 0, "form", "fields", "token", "secret"],
        message: 'Secret field "token" must use a text or URL control',
      },
    ]);
  });
});

describe("a workspace action form", () => {
  it("reports input, per-field, and coverage issues in that order", () => {
    const save = defineWorkspaceAction({
      name: "save",
      label: "Save",
      input: z.object({ a: z.string(), b: z.number(), c: z.string() }),
      output: z.object({}),
    });

    const result = safeParseRuntimeStudioOperatorView(
      {
        blocks: [
          {
            type: "action",
            action: save,
            input: { zz: 1, b: "wrong" },
            form: {
              fields: {
                a: { label: "A", control: "checkbox" },
                ghost: { label: "Ghost", control: "text" },
                b: { label: "B", control: "number", secret: true },
              },
            },
          },
        ],
      },
      { actions: [save], permission: "admin" },
    );

    expect(result).toEqual({
      success: false,
      issues: [
        {
          path: ["blocks", 0, "input", "zz"],
          message:
            'Form initial input "zz" is not declared by the action schema',
        },
        {
          path: ["blocks", 0, "input", "b"],
          message: 'Form initial input "b" does not satisfy the action schema',
        },
        {
          path: ["blocks", 0, "form", "fields", "a", "control"],
          message:
            'Form control "checkbox" is incompatible with schema field "a"',
        },
        {
          path: ["blocks", 0, "form", "fields", "ghost"],
          message: 'Form field "ghost" is not declared by the action schema',
        },
        {
          path: ["blocks", 0, "input", "b"],
          message:
            'Secret form field "b" cannot be pre-bound into browser data',
        },
        {
          path: ["blocks", 0, "form", "fields", "b", "secret"],
          message: 'Secret field "b" must use a text or URL control',
        },
        {
          path: ["blocks", 0, "form", "fields", "c"],
          message:
            'Action schema field "c" has no form declaration or pre-bound input',
        },
      ],
    });
  });
});
