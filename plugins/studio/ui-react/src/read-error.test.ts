import { expect, test } from "bun:test";
import { ApiError } from "./api";
import { readErrorMessage } from "./read-error";

test.each([
  [401, "another tab"],
  [403, "permission"],
  [404, "outside your access"],
  [429, "Wait briefly"],
] as const)(
  "read status %s has distinct recovery guidance without exposing server details",
  (status, guidance) => {
    const message = readErrorMessage(
      new ApiError(status, "private server detail"),
    );
    expect(message).toContain(guidance);
    expect(message).not.toContain("private server detail");
  },
);
test("ordinary read failures retain useful diagnostics and explicit retry guidance", () => {
  expect(readErrorMessage(new Error("Connection interrupted"))).toContain(
    "Connection interrupted",
  );
  expect(
    readErrorMessage(new ApiError(503, "Temporarily unavailable")),
  ).toContain("retry later");
});
