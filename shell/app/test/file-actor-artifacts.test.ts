import { expect, test } from "bun:test";
import {
  createFileActorOptions,
  fileActorSources,
} from "../src/file-actor-artifacts";
import { resolveFileRuntimeOptions } from "../src/file-runtime-options";

test("every default actor has an explicit production source entry", async () => {
  expect(Object.keys(fileActorSources)).toHaveLength(15);
  for (const source of Object.values(fileActorSources)) {
    expect(source.protocol).toBe("file:");
    expect(await Bun.file(source).exists()).toBe(true);
  }
  const actors = createFileActorOptions(process.execPath);
  expect(actors.producerUrls?.["ai-image"]).toEqual(
    fileActorSources["ai-image"],
  );
  expect(actors.producerUrls?.["email-source"]).toEqual(
    fileActorSources["email-source"],
  );
  expect(actors.inspectionUploadUrls?.["pdf"]).toEqual(fileActorSources.pdf);
});

test("packaged actors resolve only in the supplied installed catalog", () => {
  const actors = createFileActorOptions(
    "/external/bun",
    new URL("file:///installed/file-actors/"),
  );
  expect(actors.executable).toBe("/external/bun");
  expect(actors.uploadUrl.href).toBe("file:///installed/file-actors/upload.js");
  expect(actors.producerUrl?.href).toBe(
    "file:///installed/file-actors/render.js",
  );
  expect(actors.inspectionUploadUrls?.["pdf"]?.href).toBe(
    "file:///installed/file-actors/pdf.js",
  );
  expect(actors.producerUrls?.["file-model"]?.href).toBe(
    "file:///installed/file-actors/file-model.js",
  );
});

test("combined apps receive distinct authenticated endpoints without adding database openers", () => {
  const first = resolveFileRuntimeOptions();
  const second = resolveFileRuntimeOptions();
  expect(first.processRole).toBeUndefined();
  expect(first.fileActors).toBeDefined();
  expect(first.localDatabaseEndpoint?.secret.length).toBeGreaterThanOrEqual(32);
  expect(first.localDatabaseEndpoint?.address).not.toBe(
    second.localDatabaseEndpoint?.address,
  );
  expect(first.localDatabaseEndpoint?.secret).not.toBe(
    second.localDatabaseEndpoint?.secret,
  );
});

test("worker apps require and preserve the parent's endpoint and explicit artifact overrides", () => {
  expect(() => resolveFileRuntimeOptions({ processRole: "worker" })).toThrow(
    "parent's database endpoint",
  );
  const localDatabaseEndpoint = {
    address: "/private/owner.sock",
    sessionId: "worker",
    secret: "s".repeat(32),
  };
  const fileActors = createFileActorOptions(
    "/external/bun",
    new URL("file:///installed/file-actors/"),
  );
  const resolved = resolveFileRuntimeOptions({
    processRole: "worker",
    localDatabaseEndpoint,
    fileActors,
  });
  expect(resolved.localDatabaseEndpoint).toBe(localDatabaseEndpoint);
  expect(resolved.fileActors).toBe(fileActors);
});
