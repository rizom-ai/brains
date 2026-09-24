import { expect, test } from "bun:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  FileProcessOwner,
  ReceivedFileHttpUploadError,
} from "../src/turso-worker/file-process-owner";
import type { FileHttpUploadInput } from "../src/turso-worker/file-http-upload";
const methods: ("put" | "post")[] = ["put", "post"];
const peer = new URL("./fixtures/file-http-peer.ts", import.meta.url);
function owner(): FileProcessOwner {
  return new FileProcessOwner({
    executable: process.execPath,
    uploadUrl: peer,
    downloadUrl: peer,
    httpUploadUrl: peer,
  });
}
function input(sourceFile: string, mode = "success"): FileHttpUploadInput {
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

test.each(methods)(
  "HTTP %s cancellation observes a late receipt and holds admission through actual exit",
  async (method) => {
    const directory = await mkdtemp(join(tmpdir(), "turso-http-owner-"));
    const gate = join(directory, "upload");
    const files = owner();
    const caller = new AbortController();
    let settled = false;
    const request = {
      ...input(gate),
      ...(method === "post" && { responseMetadata: { messageId: ["id"] } }),
    };
    const work = files[method](request, caller.signal).finally(() => {
      settled = true;
    });
    try {
      await until(() => Bun.file(`${gate}.entered`).exists());
      expect(await Bun.file(`${gate}.entered`).text()).toBe(
        method.toUpperCase(),
      );
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
      expect(await work).toEqual({
        ...input(gate).facts,
        statusCode: 201,
        ...(method === "post" && {
          responseMetadata: { messageId: "receipt" },
        }),
      });
      await closing;
      expect(files.stats().children).toBe(0);
    } finally {
      await Bun.write(`${gate}.receipt`, "release");
      await Bun.write(`${gate}.exit`, "release");
      await Promise.allSettled([work, files.close()]);
    }
    await rm(directory, { recursive: true });
  },
);

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
  const work = gates.map((gate, index) =>
    index === 0 ? files.put(input(gate)) : files.post(input(gate)),
  );
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
  for (const mode of [
    "missing",
    "malformed",
    "metadata-missing",
    "metadata-extra",
    "metadata-oversized",
    "metadata-total",
  ]) {
    const directory = await mkdtemp(
      join(tmpdir(), "turso-http-owner-uncertain-"),
    );
    const gate = join(directory, "upload");
    const files = owner();
    const caller = new AbortController();
    const work = files.post(
      {
        ...input(gate, mode),
        ...(mode.startsWith("metadata-") && {
          responseMetadata:
            mode === "metadata-total"
              ? Object.fromEntries(
                  Array.from({ length: 15 }, (_, index) => [
                    `field${index}`,
                    ["id"],
                  ]),
                )
              : { messageId: ["id"] },
        }),
      },
      caller.signal,
    );
    const rejected = assert.rejects(work, (error: unknown) => {
      assert.ok(!(error instanceof ReceivedFileHttpUploadError));
      return true;
    });
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

test.each(methods)(
  "HTTP %s retains received evidence through later exit/protocol failures and shutdown",
  async (method) => {
    for (const mode of ["bad-exit", "duplicate"]) {
      const directory = await mkdtemp(join(tmpdir(), "turso-http-received-"));
      const gate = join(directory, "upload");
      const files = owner();
      const caller = new AbortController();
      let settled = false;
      const cancellation = new Error("cancelled after submission");
      let observed: ReceivedFileHttpUploadError | undefined;
      const work = files[method](
        { ...input(gate, mode), responseMetadata: { messageId: ["id"] } },
        caller.signal,
      );
      const rejected = assert
        .rejects(work, (error: unknown) => {
          assert.ok(error instanceof ReceivedFileHttpUploadError);
          observed = error;
          assert.deepEqual(error.outcome, {
            ...input(gate).facts,
            statusCode: 201,
            responseMetadata: { messageId: "receipt" },
          });
          assert.ok(error.cause instanceof AggregateError);
          assert.ok(error.cause.errors.includes(cancellation));
          const message =
            mode === "bad-exit"
              ? /exited without acknowledged completion/
              : /Repeated file actor completion/;
          assert.ok(
            error.cause.errors.some(
              (cause: unknown) =>
                cause instanceof Error && message.test(cause.message),
            ),
          );
          return true;
        })
        .finally(() => {
          settled = true;
        });
      try {
        await until(() => Bun.file(`${gate}.entered`).exists());
        caller.abort(cancellation);
        await until(() => Bun.file(`${gate}.cancelled`).exists());
        await Bun.write(`${gate}.receipt`, "receipt");
        await until(() => files.stats().terminalChildren === 1);
        expect(settled).toBe(false);
        expect(files.stats().children).toBe(1);
        const closing = Promise.allSettled([files.close()]);
        expect(settled).toBe(false);
        await Bun.write(`${gate}.exit`, "exit");
        await rejected;
        expect((await closing)[0].status).toBe("rejected");
        expect(files.stats().children).toBe(0);
        expect(files.stats().fenced).toBe(true);
        const evidence = observed;
        assert.ok(evidence);
        expect(Object.isFrozen(evidence.outcome)).toBe(true);
        expect(Object.isFrozen(evidence.outcome.responseMetadata)).toBe(true);
        await assert.rejects(
          files.close(),
          (error: unknown) =>
            error === evidence ||
            (error instanceof AggregateError &&
              error.errors.includes(evidence)),
        );
        await assert.rejects(files[method](input(gate)), /fenced/);
      } finally {
        await Bun.write(`${gate}.receipt`, "release");
        await Bun.write(`${gate}.exit`, "release");
        await Promise.allSettled([rejected, files.close()]);
      }
      // Keep the failed peer's gate evidence for diagnosis.
    }
  },
);

test("a shared owner fence retains both already-received HTTP outcomes", async () => {
  const directory = await mkdtemp(join(tmpdir(), "turso-http-received-pair-"));
  const gates = [join(directory, "first"), join(directory, "second")];
  const files = owner();
  const outcomes: ReceivedFileHttpUploadError[] = [];
  const work = gates.map((gate, index) =>
    assert.rejects(
      files.post({
        ...input(gate, index === 0 ? "bad-exit" : "success"),
        facts: { sizeBytes: 1, sha256: (index === 0 ? "a" : "b").repeat(64) },
      }),
      (error: unknown) => {
        assert.ok(error instanceof ReceivedFileHttpUploadError);
        outcomes.push(error);
        return true;
      },
    ),
  );
  try {
    for (const gate of gates) await Bun.write(`${gate}.receipt`, "receipt");
    await until(() => files.stats().terminalChildren === 2);
    expect(files.stats().children).toBe(2);
    const closing = Promise.allSettled([files.close()]);
    await Bun.write(`${gates[0]}.exit`, "fail first actor");
    await Promise.all(work);
    expect((await closing)[0].status).toBe("rejected");
    expect(outcomes.map((error) => error.outcome.sha256).sort()).toEqual([
      "a".repeat(64),
      "b".repeat(64),
    ]);
    expect(files.stats().children).toBe(0);
    await assert.rejects(files.close(), (error: unknown) => {
      const seen = new Set<unknown>();
      const pending: unknown[] = [error];
      while (pending.length > 0) {
        const value = pending.pop();
        if (seen.has(value)) continue;
        seen.add(value);
        if (value instanceof Error) pending.push(value.cause);
        if (value instanceof AggregateError) pending.push(...value.errors);
      }
      assert.ok(outcomes.every((outcome) => seen.has(outcome)));
      return true;
    });
  } finally {
    for (const gate of gates) {
      await Bun.write(`${gate}.receipt`, "release");
      await Bun.write(`${gate}.exit`, "release");
    }
    await Promise.allSettled([...work, files.close()]);
  }
  // Failed actor evidence remains available; neither outcome is replayed.
});

test.each(methods)(
  "HTTP %s ownership requires provisioning and pre-aborts without admission",
  async (method) => {
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
      await assert.rejects(
        missing[method](input("/unused")),
        /not provisioned/,
      );
      await assert.rejects(
        files[method](input("/unused"), caller.signal),
        (error: unknown) => error === primary,
      );
      expect(files.stats().children).toBe(0);
    } finally {
      await files.close();
      await missing.close();
    }
  },
);
