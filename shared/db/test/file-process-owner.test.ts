import { expect, test } from "bun:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileProcessOwner } from "../src/turso-worker/file-process-owner";
import type { FileUploadInput } from "../src/turso-worker/file-upload";

const peer = new URL("./fixtures/file-process-peer.ts", import.meta.url);
function owner(): FileProcessOwner {
  return new FileProcessOwner({
    executable: process.execPath,
    uploadUrl: peer,
    downloadUrl: peer,
  });
}
function input(path: string): FileUploadInput {
  return {
    sourceFile: path,
    size: 0,
    endpoint: { host: "127.0.0.1", port: 1, token: "a".repeat(64) },
  };
}
async function marker(path: string): Promise<void> {
  const deadline = Date.now() + 3000;
  while (!(await Bun.file(path).exists())) {
    if (Date.now() > deadline) throw new Error(`Missing peer gate: ${path}`);
    await Bun.sleep(5);
  }
}

async function terminals(
  files: FileProcessOwner,
  count: number,
): Promise<void> {
  const deadline = Date.now() + 3000;
  while (files.stats().terminalChildren !== count) {
    if (Date.now() > deadline)
      throw new Error("Owner did not observe terminal metadata");
    await Bun.sleep(5);
  }
}

test("named inspection is explicit and waits for its selected actor's actual exit", async () => {
  const root = await mkdtemp(join(tmpdir(), "turso-named-inspector-"));
  const gate = join(root, "inspection");
  const files = new FileProcessOwner({
    executable: process.execPath,
    uploadUrl: peer,
    downloadUrl: peer,
    inspectionUploadUrls: { pdf: peer },
  });
  let settled = false;
  const inspected = files
    .inspectUpload(input(gate), undefined, "pdf")
    .finally(() => {
      settled = true;
    });
  try {
    await terminals(files, 1);
    expect(settled).toBe(false);
    await assert.rejects(
      files.inspectUpload(input(gate), undefined, "missing"),
      /not provisioned/,
    );
    await assert.rejects(files.inspectUpload(input(gate)), /not provisioned/);
    expect(files.stats().children).toBe(1);
  } finally {
    await Bun.write(`${gate}.exit`, "release");
    try {
      await inspected;
    } finally {
      await files.close();
    }
  }
  expect(await inspected).toEqual({
    sizeBytes: 0,
    sha256: "a".repeat(64),
    details: { kind: "fixture" },
  });
  expect(files.stats().children).toBe(0);
  await rm(root, { recursive: true });
});

test("inspection selector configuration is bounded and local", () => {
  const base = {
    executable: process.execPath,
    uploadUrl: peer,
    downloadUrl: peer,
  };
  expect(
    () =>
      new FileProcessOwner({
        ...base,
        inspectionUploadUrls: { "bad/name": peer },
      }),
  ).toThrow();
  expect(
    () =>
      new FileProcessOwner({
        ...base,
        inspectionUploadUrls: {
          pdf: new URL("https://example.test/inspector"),
        },
      }),
  ).toThrow(/explicit local URL/);
  expect(
    () =>
      new FileProcessOwner({
        ...base,
        inspectionUploadUrls: Object.fromEntries(
          Array.from({ length: 17 }, (_, index) => [`pdf-${index}`, peer]),
        ),
      }),
  ).toThrow(/configuration exceeds/);
});

test("bulk production shares actor admission and holds its single reservation through actual exit", async () => {
  const root = await mkdtemp(join(tmpdir(), "turso-producer-owner-"));
  const gate = join(root, "producer");
  const files = new FileProcessOwner({
    executable: process.execPath,
    uploadUrl: peer,
    downloadUrl: peer,
    producerUrl: peer,
  });
  const producing = files.produce({
    sourceDirectory: gate,
    outputFile: join(root, "output"),
  });
  const ordinaryGate = join(root, "ordinary");
  const ordinary = files.upload(input(ordinaryGate));
  let settled = false;
  void producing.then(
    () => {
      settled = true;
    },
    () => {
      settled = true;
    },
  );
  try {
    await terminals(files, 2);
    expect(settled).toBe(false);
    await assert.rejects(
      files.produce({ sourceDirectory: gate, outputFile: join(root, "other") }),
      /production capacity/,
    );
    await assert.rejects(files.upload(input(join(root, "third"))), /capacity/);
    expect(files.stats().children).toBe(2);
  } finally {
    await Bun.write(`${gate}.exit`, "release");
    await Bun.write(`${ordinaryGate}.exit`, "release");
    await Promise.all([producing, ordinary]);
    await files.close();
    await rm(root, { recursive: true });
  }
  expect(files.stats().children).toBe(0);
});

test("file process completion and capacity remain held until actual exit", async () => {
  const root = await mkdtemp(join(tmpdir(), "turso-file-owner-"));
  const files = owner();
  const a = join(root, "a"),
    b = join(root, "b");
  let settled = false;
  const first = files.upload(input(a));
  const second = files.upload(input(b));
  void first.then(
    () => {
      settled = true;
    },
    () => {
      settled = true;
    },
  );
  try {
    await terminals(files, 2);
    expect(settled).toBe(false);
    expect(files.stats().children).toBe(2);
    await assert.rejects(files.upload(input(join(root, "c"))), /capacity/);
    await Bun.write(`${a}.exit`, "release");
    expect(await first).toEqual({ sizeBytes: 0, sha256: "a".repeat(64) });
    expect(files.stats().children).toBe(1);
  } finally {
    await Bun.write(`${a}.exit`, "release");
    await Bun.write(`${b}.exit`, "release");
    await Promise.allSettled([first, second]);
    await files.close();
  }
  expect(files.stats().children).toBe(0);
  await rm(root, { recursive: true });
});

test("cancellation preserves its cause and close waits for the creator's actual join", async () => {
  const root = await mkdtemp(join(tmpdir(), "turso-file-owner-"));
  const path = join(root, "cancel");
  const files = owner();
  const signal = new AbortController();
  const primary = new Error("caller cancelled");
  const transfer = files.upload(input(path), signal.signal);
  const rejected = assert.rejects(
    transfer,
    (error: unknown) => error === primary,
  );
  try {
    await terminals(files, 1);
    signal.abort(primary);
    await marker(`${path}.terminated`);
    let closed = false;
    const closing = files.close().then(() => {
      closed = true;
    });
    expect(closed).toBe(false);
    expect(files.stats().children).toBe(1);
    await assert.rejects(files.upload(input(path)), /fenced/);
    await Bun.write(`${path}.exit`, "release");
    await Promise.all([rejected, closing]);
    expect(closed).toBe(true);
    expect(files.stats().children).toBe(0);
  } finally {
    await Bun.write(`${path}.exit`, "release");
    await Promise.allSettled([transfer, rejected]);
    await files.close();
  }
  await rm(root, { recursive: true });
});

test("missing file actors fail closed after joined exit without selecting another artifact", async () => {
  const files = new FileProcessOwner({
    executable: process.execPath,
    uploadUrl: new URL("./fixtures/not-an-actor.ts", import.meta.url),
    downloadUrl: peer,
  });
  await assert.rejects(
    files.upload(input("/unused")),
    /without acknowledged completion/,
  );
  expect(files.stats()).toEqual({
    children: 0,
    terminalChildren: 0,
    fenced: true,
  });
  await assert.rejects(files.upload(input("/unused")), /fenced/);
  await assert.rejects(files.close(), /without acknowledged completion/);
});

test("inspection metadata is required after actual actor exit and fences reuse", async () => {
  const root = await mkdtemp(join(tmpdir(), "turso-file-inspection-owner-"));
  const path = join(root, "inspect");
  const files = new FileProcessOwner({
    executable: process.execPath,
    uploadUrl: peer,
    downloadUrl: peer,
    inspectionUploadUrl: peer,
  });
  const transfer = files.inspectUpload(input(path));
  const rejected = assert.rejects(transfer, /returned no metadata/);
  try {
    await terminals(files, 1);
    expect(files.stats().children).toBe(1);
  } finally {
    await Bun.write(`${path}.exit`, "release");
    await rejected;
    await assert.rejects(files.close(), /returned no metadata/);
    await rm(root, { recursive: true });
  }
  expect(files.stats()).toEqual({
    children: 0,
    terminalChildren: 0,
    fenced: true,
  });
});

test("file process rejects implicit runtimes and synthetic input before spawning", async () => {
  expect(
    () =>
      new FileProcessOwner({
        executable: "bun",
        uploadUrl: peer,
        downloadUrl: peer,
      }),
  ).toThrow(/absolute/);
  const files = owner();
  const signal = new AbortController();
  signal.abort();
  await assert.rejects(files.upload(input("/unused"), signal.signal));
  const synthetic = { ...input("/unused"), pause: true };
  await assert.rejects(files.upload(synthetic));
  await assert.rejects(
    files.upload({ ...input("/unused"), size: 100 * 1024 * 1024 + 1 }),
  );
  expect(files.stats().children).toBe(0);
  await files.close();
});
