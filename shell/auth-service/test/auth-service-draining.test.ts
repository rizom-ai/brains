import { afterEach, describe, expect, it, spyOn } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deferred } from "@brains/utils/deferred";
import { AuthService, type AuthServiceOptions } from "../src/auth-service";

const tempDirs: string[] = [];
const services: AuthService[] = [];

async function createService(
  options: Partial<AuthServiceOptions> = {},
): Promise<AuthService> {
  const storageDir = await mkdtemp(join(tmpdir(), "brains-auth-drain-"));
  tempDirs.push(storageDir);
  const service = new AuthService({
    storageDir,
    issuer: "https://brain.example.com",
    ...options,
  });
  services.push(service);
  await service.initialize();
  return service;
}

function expectClosed(service: AuthService): void {
  expect(() => service["runtime"]["runtimeDatabase"].db).toThrow(
    "Auth runtime database has not been started",
  );
}

afterEach(async () => {
  await Promise.allSettled(
    services.splice(0).map(async (service) => {
      try {
        await service.close();
      } finally {
        // Also release clients reopened by a regressing request after close.
        await service["runtime"]["runtimeDatabase"].stop();
      }
    }),
  );
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

describe("AuthService operation draining", () => {
  it("owns a cold HTTP request before its first initialization await", async () => {
    const storageDir = await mkdtemp(
      join(tmpdir(), "brains-auth-cold-request-"),
    );
    tempDirs.push(storageDir);
    const service = new AuthService({
      storageDir,
      issuer: "https://brain.example.com",
    });
    services.push(service);
    const handling = service.handleWellKnownRequest(
      new Request("https://brain.example.com/.well-known/jwks.json"),
    );
    const closing = service.close();
    const results = await Promise.allSettled([handling, closing]);
    expect(results.map((result) => result.status)).toEqual([
      "fulfilled",
      "fulfilled",
    ]);
    expect((await handling).status).toBe(200);
    expectClosed(service);
  });

  it("drains the complete HTTP handler before closing its database", async () => {
    const service = await createService();
    const entered = deferred();
    const release = deferred();
    const request = new Request("https://brain.example.com/register", {
      method: "POST",
    });
    const read = spyOn(request, "json").mockImplementation(async () => {
      entered.resolve();
      await release.promise;
      return { redirect_uris: ["https://client.example.com/callback"] };
    });
    const handling = service.handleRequest(request);
    await entered.promise;
    let closed = false;
    const closing = service.close().then(() => {
      closed = true;
    });
    try {
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(closed).toBe(false);
    } finally {
      release.resolve();
      await Promise.allSettled([handling, closing]);
      read.mockRestore();
    }
    expect((await handling).status).toBe(201);
    await closing;
    expectClosed(service);
  });

  it("drains facade I/O after lazy startup has finished", async () => {
    const service = await createService();
    const admin = service["runtime"].getAdministrationService();
    const list = admin.listUsers.bind(admin);
    const entered = deferred();
    const release = deferred();
    const listSpy = spyOn(admin, "listUsers").mockImplementation(async () => {
      entered.resolve();
      await release.promise;
      return list();
    });
    const query = service.listUsers();
    await entered.promise;
    let closed = false;
    const closing = service.close().then(() => {
      closed = true;
    });
    try {
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(closed).toBe(false);
    } finally {
      release.resolve();
      await Promise.allSettled([query, closing]);
      listSpy.mockRestore();
    }
    expect(await query).toEqual([]);
    await closing;
    expectClosed(service);
  });

  it("allows nested calls from admitted handlers while deferring later callers", async () => {
    const service = await createService();
    const entered = deferred();
    const release = deferred();
    const events: string[] = [];
    const router = spyOn(service["requestRouter"], "handle").mockImplementation(
      async () => {
        entered.resolve();
        await release.promise;
        expect(await service.listUsers()).toEqual([]);
        expect((await service.getJwks()).keys).toHaveLength(2);
        events.push("nested");
        return new Response("OK");
      },
    );
    const runtime = service["runtime"];
    const close = runtime.close.bind(runtime);
    const closeSpy = spyOn(runtime, "close").mockImplementation(
      async (): Promise<void> => {
        events.push("close");
        await close();
      },
    );
    const handling = service.handleRequest(
      new Request("https://brain.example.com/login"),
    );
    await entered.promise;
    const closing = service.close();
    const later = service.listUsers().then((users) => {
      events.push("later");
      return users;
    });
    release.resolve();
    try {
      const results = await Promise.allSettled([handling, closing, later]);
      expect(results.map((result) => result.status)).toEqual([
        "fulfilled",
        "fulfilled",
        "fulfilled",
      ]);
      expect(events).toEqual(["nested", "close", "later"]);
      expect(await later).toEqual([]);
    } finally {
      router.mockRestore();
      closeSpy.mockRestore();
    }
  });

  it("allows admitted background recovery to finish nested facade calls during close", async () => {
    const service = await createService({
      autoStartInvitationDeliveryRecovery: false,
    });
    const runtime = service["runtime"];
    const supervisor = runtime["invitationDeliverySupervisor"];
    if (!supervisor) throw new Error("Missing invitation supervisor");
    const entered = deferred();
    const release = deferred();
    let nested: Promise<unknown> | undefined;
    let nestedFinished = false;
    let nestedFinishedBeforeRecoveryReturned = false;
    const recover = spyOn(
      runtime.getInvitationService(),
      "recoverInterruptedDeliveries",
    ).mockImplementation(async (): Promise<number> => {
      entered.resolve();
      await release.promise;
      nested = service.listUsers().then((users) => {
        nestedFinished = true;
        return users;
      });
      await new Promise<void>((resolve) => setImmediate(resolve));
      nestedFinishedBeforeRecoveryReturned = nestedFinished;
      return 0;
    });
    // Drive the same Promise admission used by a scheduled supervisor run.
    const background = supervisor["trackTask"](() =>
      supervisor["task"](Date.now()),
    );
    await entered.promise;
    const closing = service.close();
    release.resolve();
    try {
      const results = await Promise.allSettled([background, closing]);
      await nested;
      expect(results.map((result) => result.status)).toEqual([
        "fulfilled",
        "fulfilled",
      ]);
      expect(nestedFinishedBeforeRecoveryReturned).toBe(true);
      expectClosed(service);
    } finally {
      recover.mockRestore();
    }
  });

  it("gives OAuth maintenance the same nested-call admission during close", async () => {
    const service = await createService({
      autoStartInvitationDeliveryRecovery: false,
    });
    const runtime = service["runtime"];
    await runtime.oauthEndpoints.stopClientMaintenance();
    const entered = deferred();
    const release = deferred();
    let nested: Promise<unknown> | undefined;
    let nestedFinished = false;
    let nestedFinishedBeforeMaintenanceReturned = false;
    const prune = spyOn(
      runtime.clientStore,
      "pruneStaleUnconsentedClients",
    ).mockImplementation(async (): Promise<number> => {
      entered.resolve();
      await release.promise;
      nested = service.listUsers().then((users) => {
        nestedFinished = true;
        return users;
      });
      await new Promise<void>((resolve) => setImmediate(resolve));
      nestedFinishedBeforeMaintenanceReturned = nestedFinished;
      return 0;
    });
    const starting = runtime.oauthEndpoints.startClientMaintenance();
    await entered.promise;
    const closing = service.close();
    release.resolve();
    try {
      const results = await Promise.allSettled([starting, closing]);
      await nested;
      expect(results.map((result) => result.status)).toEqual([
        "fulfilled",
        "fulfilled",
      ]);
      expect(nestedFinishedBeforeMaintenanceReturned).toBe(true);
      expectClosed(service);
    } finally {
      prune.mockRestore();
    }
  });

  it("preserves concurrency between independent HTTP handlers", async () => {
    const service = await createService();
    const entered = deferred();
    const release = deferred();
    let calls = 0;
    const router = spyOn(service["requestRouter"], "handle").mockImplementation(
      async () => {
        calls += 1;
        entered.resolve();
        await release.promise;
        return new Response("OK");
      },
    );
    const first = service.handleRequest(
      new Request("https://brain.example.com/login"),
    );
    await entered.promise;
    const second = service.handleRequest(
      new Request("https://brain.example.com/login"),
    );
    try {
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(calls).toBe(2);
    } finally {
      release.resolve();
      await Promise.allSettled([first, second]);
      router.mockRestore();
    }
    expect((await first).status).toBe(200);
    expect((await second).status).toBe(200);
  });

  it("retains request failures while draining their still-active siblings", async () => {
    const service = await createService();
    const entered = deferred();
    const releaseFailure = deferred();
    const releaseSuccess = deferred();
    const failure = new Error("Request failed");
    let calls = 0;
    const router = spyOn(service["requestRouter"], "handle").mockImplementation(
      async (request) => {
        calls += 1;
        if (calls === 2) entered.resolve();
        if (new URL(request.url).pathname === "/bad") {
          await releaseFailure.promise;
          throw failure;
        }
        await releaseSuccess.promise;
        return new Response("OK");
      },
    );
    const bad = service
      .handleRequest(new Request("https://brain.example.com/bad"))
      .catch((error: unknown) => error);
    const good = service.handleRequest(
      new Request("https://brain.example.com/good"),
    );
    await entered.promise;
    let closed = false;
    const closing = service.close().then(() => {
      closed = true;
    });
    try {
      releaseFailure.resolve();
      expect(await bad).toBe(failure);
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(closed).toBe(false);
    } finally {
      releaseFailure.resolve();
      releaseSuccess.resolve();
      await Promise.allSettled([bad, good, closing]);
      router.mockRestore();
    }
    expect((await good).status).toBe(200);
    await closing;
    expectClosed(service);
  });
});
