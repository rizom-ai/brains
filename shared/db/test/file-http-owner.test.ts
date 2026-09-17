import { expect, test } from "bun:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { FileProcessOwner } from "../src/turso-worker/file-process-owner";
import type { FileHttpPutInput } from "../src/turso-worker/file-http-put";
const peer = new URL("./fixtures/file-http-peer.ts", import.meta.url);
function owner(): FileProcessOwner {
  return new FileProcessOwner({
    executable: process.execPath,
    uploadUrl: peer,
    downloadUrl: peer,
    httpUploadUrl: peer,
  });
}
function input(sourceFile: string, mode = "success"): FileHttpPutInput {
  return {
    sourceFile,
    url: `http://127.0.0.1/${mode}`,
    headers: {},
    facts: { sizeBytes: 1, sha256: "a".repeat(64) },
  };
}
async function until(check: () => boolean | Promise<boolean>): Promise<void> {
  const deadline = Date.now() + 3000;
  while (!(await check())) {
    if (Date.now() > deadline)
      throw new Error("HTTP peer gate was not reached");
    await Bun.sleep(5);
  }
}

test("HTTP cancellation observes a late receipt and holds admission through actual exit", async () => {
  const directory = await mkdtemp(join(tmpdir(), "turso-http-owner-"));
  const gate = join(directory, "upload");
  const files = owner();
  const caller = new AbortController();
  let settled = false;
  const work = files.put(input(gate), caller.signal).finally(() => {
    settled = true;
  });
  try {
    await until(() => Bun.file(`${gate}.entered`).exists());
    caller.abort(new Error("caller cancelled after submission"));
    await until(() => Bun.file(`${gate}.cancelled`).exists());
    expect(settled).toBe(false);
    await Bun.write(`${gate}.receipt`, "acknowledge");
    await until(() => files.stats().terminalChildren === 1);
    expect(settled).toBe(false);
    let closed = false;
    const closing = files.close().then(() => {
      closed = true;
    });
    expect(closed).toBe(false);
    expect(files.stats().children).toBe(1);
    await Bun.write(`${gate}.exit`, "release");
    expect(await work).toEqual({ ...input(gate).facts, statusCode: 201 });
    await closing;
    expect(files.stats().children).toBe(0);
  } finally {
    await Bun.write(`${gate}.receipt`, "release");
    await Bun.write(`${gate}.exit`, "release");
    await Promise.allSettled([work, files.close()]);
  }
  await rm(directory, { recursive: true });
});

test("cancellation after an HTTP receipt does not terminate or retract its actor outcome", async () => {
  const directory = await mkdtemp(
    join(tmpdir(), "turso-http-owner-acknowledged-"),
  );
  const gate = join(directory, "upload");
  await Bun.write(`${gate}.receipt`, "acknowledge");
  const files = owner();
  const caller = new AbortController();
  const work = files.put(input(gate), caller.signal);
  try {
    await until(() => files.stats().terminalChildren === 1);
    caller.abort(new Error("late cancellation"));
    expect(files.stats().children).toBe(1);
    expect(await Bun.file(`${gate}.cancelled`).exists()).toBe(false);
    await Bun.write(`${gate}.exit`, "release");
    expect((await work).statusCode).toBe(201);
  } finally {
    await Bun.write(`${gate}.exit`, "release");
    await Promise.allSettled([work, files.close()]);
  }
  await rm(directory, { recursive: true });
});

test("HTTP failures preserve cancellation and the actor cause without poisoning confirmed retirement", async () => {
  const directory = await mkdtemp(join(tmpdir(), "turso-http-owner-failure-"));
  const gate = join(directory, "upload");
  const files = owner();
  const caller = new AbortController();
  const primary = new Error("cancelled");
  const work = files.put(input(gate, "failure"), caller.signal);
  const rejected = assert.rejects(work, (error: unknown) => {
    assert.ok(error instanceof AggregateError);
    assert.equal(error.cause, primary);
    assert.ok(
      error.errors.some(
        (cause: unknown) =>
          cause instanceof Error && cause.message === "remote transfer failed",
      ),
    );
    return true;
  });
  try {
    await until(() => Bun.file(`${gate}.entered`).exists());
    caller.abort(primary);
    await until(() => Bun.file(`${gate}.cancelled`).exists());
    await Bun.write(`${gate}.receipt`, "failure");
    await Bun.write(`${gate}.exit`, "release");
    await rejected;
    expect(files.stats()).toEqual({
      children: 0,
      terminalChildren: 0,
      fenced: false,
    });
  } finally {
    await Bun.write(`${gate}.receipt`, "release");
    await Bun.write(`${gate}.exit`, "release");
    await Promise.allSettled([rejected, files.close()]);
  }
  await rm(directory, { recursive: true });
});

test("HTTP uploads share the two-child limit and shutdown observes outstanding receipts", async () => {
  const directory = await mkdtemp(join(tmpdir(), "turso-http-owner-capacity-"));
  const gates = [join(directory, "first"), join(directory, "second")];
  const files = owner();
  const work = gates.map((gate) => files.put(input(gate)));
  try {
    await Promise.all(
      gates.map((gate) => until(() => Bun.file(`${gate}.entered`).exists())),
    );
    await assert.rejects(
      files.put(input(join(directory, "third"))),
      /capacity exceeded/,
    );
    expect(files.stats().children).toBe(2);
    let closed = false;
    const closing = files.close().then(() => {
      closed = true;
    });
    await Promise.all(
      gates.map((gate) => until(() => Bun.file(`${gate}.cancelled`).exists())),
    );
    expect(closed).toBe(false);
    for (const gate of gates) await Bun.write(`${gate}.receipt`, "acknowledge");
    await until(() => files.stats().terminalChildren === 2);
    expect(closed).toBe(false);
    for (const gate of gates) await Bun.write(`${gate}.exit`, "release");
    expect(
      (await Promise.all(work)).map((receipt) => receipt.statusCode),
    ).toEqual([201, 201]);
    await closing;
    expect(files.stats().children).toBe(0);
  } finally {
    for (const gate of gates) {
      await Bun.write(`${gate}.receipt`, "release");
      await Bun.write(`${gate}.exit`, "release");
    }
    await Promise.allSettled([...work, files.close()]);
  }
  await rm(directory, { recursive: true });
});

test("missing or malformed HTTP receipts fence reuse even after cancellation", async () => {
  for (const mode of ["missing", "malformed"]) {
    const directory = await mkdtemp(
      join(tmpdir(), "turso-http-owner-uncertain-"),
    );
    const gate = join(directory, "upload");
    const files = owner();
    const caller = new AbortController();
    const work = files.put(input(gate, mode), caller.signal);
    const rejected = assert.rejects(work);
    try {
      await until(() => Bun.file(`${gate}.entered`).exists());
      caller.abort(new Error("cancelled with uncertain remote outcome"));
      await until(() => Bun.file(`${gate}.cancelled`).exists());
      await Bun.write(`${gate}.receipt`, "release");
      await Bun.write(`${gate}.exit`, "release");
      await rejected;
      expect(files.stats().fenced).toBe(true);
      expect(files.stats().children).toBe(0);
      await assert.rejects(files.put(input(gate)), /fenced/);
      await assert.rejects(files.close());
    } finally {
      await Bun.write(`${gate}.receipt`, "release");
      await Bun.write(`${gate}.exit`, "release");
      await Promise.allSettled([rejected, files.close()]);
    }
    // Retain the peer's uncertain-receipt evidence.
  }
});

test("HTTP ownership requires provisioning and pre-aborts without admission", async () => {
  const files = owner();
  const missing = new FileProcessOwner({
    executable: process.execPath,
    uploadUrl: peer,
    downloadUrl: peer,
  });
  const caller = new AbortController();
  const primary = new Error("pre-abort");
  caller.abort(primary);
  try {
    await assert.rejects(missing.put(input("/unused")), /not provisioned/);
    await assert.rejects(
      files.put(input("/unused"), caller.signal),
      (error: unknown) => error === primary,
    );
    expect(files.stats().children).toBe(0);
  } finally {
    await files.close();
    await missing.close();
  }
});
