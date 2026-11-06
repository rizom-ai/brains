import { describe, expect, it } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "@brains/utils/zod";
import {
  SdkError,
  sdkErrorCodeSchema,
  sdkErrorSchema,
  sdkErrorHttpStatus,
  toSdkError,
} from "../src/sdk-error";

const secret = "private-token-and-request-body";

describe("the shared SDK failure contract", () => {
  it("keeps diagnostics local and serializes only bounded public fields", () => {
    const error = new SdkError("permission_denied", {
      message: secret,
      cause: new Error(secret),
    });
    expect(error.message).toBe(secret);
    expect(error.cause).toBeInstanceOf(Error);
    const wire: unknown = JSON.parse(JSON.stringify(error));
    expect(wire).toEqual({
      code: "permission_denied",
      message: "Permission denied",
    });
    expect(sdkErrorSchema.safeParse(wire).success).toBe(true);
    expect(JSON.stringify(wire)).not.toContain(secret);
    expect(Object.keys(sdkErrorSchema.parse(wire))).toEqual([
      "code",
      "message",
    ]);
  });

  it("publishes only an explicit bounded public message, never the diagnostic", () => {
    const error = new SdkError("conflict", {
      message: secret,
      publicMessage: "Refresh the selection and try again",
      cause: new Error(secret),
    });
    expect(toSdkError(error).message).toBe(
      "Refresh the selection and try again",
    );
    expect(error.toJSON()).toEqual({
      code: "conflict",
      message: "Refresh the selection and try again",
    });
    expect(JSON.stringify(error)).not.toContain(secret);
    expect(
      () => new SdkError("conflict", { publicMessage: "x".repeat(1025) }),
    ).toThrow();
    expect(
      toSdkError({ code: "conflict", publicMessage: "x".repeat(1025) }).message,
    ).toBe("The operation conflicts with the current state");
    expect(
      toSdkError({ code: "future_code", publicMessage: secret }).message,
    ).toBe("The operation failed");
  });

  it("preserves codes rather than exception identity or message wording", () => {
    for (const code of sdkErrorCodeSchema.options) {
      for (const message of [
        secret,
        "completely different wording",
        "x".repeat(4096),
      ]) {
        const failure = toSdkError(Object.assign(new Error(message), { code }));
        expect(failure.code).toBe(code);
        expect(sdkErrorSchema.safeParse(failure.toJSON()).success).toBe(true);
        expect(failure.message).not.toBe(message);
      }
    }
    expect(toSdkError(new DOMException(secret, "AbortError")).code).toBe(
      "cancelled",
    );
    expect(toSdkError(new DOMException(secret, "TimeoutError")).code).toBe(
      "deadline_exceeded",
    );
  });

  it("sanitizes unknown codes, plain errors and unreadable thrown objects", () => {
    for (const thrown of [
      secret,
      null,
      new Error(secret),
      { code: "future_code", message: secret },
      {
        get code(): never {
          throw new Error(secret);
        },
      },
      new Proxy(
        {},
        {
          get(): never {
            throw new Error(secret);
          },
        },
      ),
    ]) {
      const failure = toSdkError(thrown);
      expect(failure.code).toBe("handler_failed");
      expect(JSON.stringify(failure)).not.toContain(secret);
      expect(toSdkError(thrown, "invalid_response").code).toBe(
        "invalid_response",
      );
    }
    expect(() => {
      // @ts-expect-error SDK codes are schema-backed, not arbitrary strings.
      new SdkError("future_code");
    }).toThrow();
  });

  it("survives an independently bundled contract copy and a JSON round trip", async () => {
    const directory = await mkdtemp(join(tmpdir(), "sdk-error-copy-"));
    try {
      const entry = join(directory, "producer.ts");
      await writeFile(
        entry,
        `import { SdkError } from ${JSON.stringify(new URL("../src/sdk-error.ts", import.meta.url).pathname)};
export default new SdkError("not_found", {message: ${JSON.stringify(secret)}, publicMessage: "Select an existing resource"});`,
      );
      const build = await Bun.build({
        entrypoints: [entry],
        outdir: join(directory, "bundle"),
        target: "bun",
      });
      expect(build.success).toBe(true);
      const loaded: unknown = await import(
        pathToFileURL(join(directory, "bundle", "producer.js")).href
      );
      const foreign = z.object({ default: z.unknown() }).parse(loaded).default;
      expect(foreign).not.toBeInstanceOf(SdkError);
      expect(toSdkError(foreign).code).toBe("not_found");
      expect(toSdkError(foreign).message).toBe("Select an existing resource");
      const wire: unknown = JSON.parse(JSON.stringify(foreign));
      expect(toSdkError(wire).code).toBe("not_found");
      expect(JSON.stringify(wire)).not.toContain(secret);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("owns the HTTP mapping without changing protocol-specific envelopes", () => {
    expect(
      sdkErrorCodeSchema.options.map((code) => [
        code,
        sdkErrorHttpStatus(code),
      ]),
    ).toEqual([
      ["no_handler", 503],
      ["handler_failed", 500],
      ["invalid_input", 400],
      ["invalid_response", 500],
      ["unauthenticated", 401],
      ["permission_denied", 403],
      ["not_found", 404],
      ["conflict", 409],
      ["cancelled", 408],
      ["deadline_exceeded", 504],
    ]);
  });
});
