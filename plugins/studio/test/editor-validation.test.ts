import { expect, test } from "bun:test";
import { z } from "@brains/utils/zod";
import {
  editorValidationResponse,
  frontmatterIssueResponse,
} from "../src/editor-validation";

test("field issues survive an entity validation error from a separately bundled runtime", async () => {
  const issues = [
    {
      path: ["clients"],
      message: "Clients: choose values from the configured list.",
    },
  ];
  const error = Object.assign(new Error("Invalid entity data for note"), {
    name: "EntityValidationError",
    entityType: "note",
    originalError: { issues },
    phase: "persist",
  });
  const response = editorValidationResponse(error);
  expect(response?.status).toBe(400);
  expect(await response?.json()).toEqual({
    error: "Invalid entity data",
    issues,
  });
});

test("unrelated persistence failures are not disguised as field validation", () => {
  expect(
    editorValidationResponse(new Error("Database unavailable")),
  ).toBeUndefined();
});

test("a required field left empty is named as required, not as a type error", async () => {
  const schema = z.object({
    status: z.enum(["draft", "published"]),
    excerpt: z.string(),
    author: z.string().min(2),
  });
  const values = { status: "", author: "A" };
  const result = schema.safeParse(values);
  if (result.success) throw new Error("Expected issues");
  const response = frontmatterIssueResponse(result.error, values);
  expect(response.status).toBe(400);
  const body = await response.json();
  expect(body.error).toBe("Invalid frontmatter");
  expect(
    body.issues.map((issue: { path: string[]; message: string }) => [
      issue.path[0],
      issue.message,
    ]),
  ).toEqual([
    ["status", "Required."],
    ["excerpt", "Required."],
    // A value that is there but wrong keeps the schema's own message.
    ["author", "Too small: expected string to have >=2 characters"],
  ]);
});
