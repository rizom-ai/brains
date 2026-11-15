import { afterEach, describe, expect, it } from "bun:test";
import {
  imageJobs,
  VALID_PNG_DATA_URL,
  type ImageJobs,
} from "./image-job-harness";

/**
 * `system_create` with a data URL in an image's content makes a direct
 * create with the title alone, as it did before images were assets. The
 * image is refused, with the same error as before, and nothing is stored:
 * no write keeps an image as a data URL.
 */

let opened: ImageJobs | undefined;
afterEach(async () => {
  await opened?.close();
  opened = undefined;
});

/** The refusal the store gave before images were assets. */
const REFUSAL = [
  {
    code: "invalid_value",
    values: ["png", "jpg", "jpeg", "webp", "gif", "svg"],
    path: ["metadata", "format"],
    message:
      'Invalid option: expected one of "png"|"jpg"|"jpeg"|"webp"|"gif"|"svg"',
  },
  {
    expected: "number",
    code: "invalid_type",
    path: ["metadata", "width"],
    message: "Invalid input: expected number, received undefined",
  },
  {
    expected: "number",
    code: "invalid_type",
    path: ["metadata", "height"],
    message: "Invalid input: expected number, received undefined",
  },
];

describe("a direct image create with a data URL in its content", () => {
  it.each([
    ["a valid image", VALID_PNG_DATA_URL],
    ["an invalid payload", "data:image/png;base64,!!!notbase64"],
    ["a non-image", "data:text/plain;base64,aGVsbG8="],
  ])("refuses %s as before and stores nothing", async (_case, content) => {
    const jobs = await imageJobs();
    opened = jobs;

    const refusal = await jobs.service
      .createEntity({
        entity: {
          id: "direct",
          entityType: "image",
          content,
          metadata: { title: "Direct" },
        },
        options: { deduplicateId: true },
      })
      .catch((error: unknown) => error);

    if (!(refusal instanceof Error)) throw new Error("Expected a refusal");
    expect(JSON.parse(refusal.message)).toEqual(REFUSAL);
    expect(await jobs.stored("image", "direct")).toBeNull();
  });
});
