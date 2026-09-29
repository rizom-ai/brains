import { expect, test } from "bun:test";
import { editorValidationResponse } from "../src/editor-validation";

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
