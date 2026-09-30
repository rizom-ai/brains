import { afterEach, describe, expect, it, mock, spyOn } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deferred } from "@brains/utils/deferred";
import { AuthRuntime, type AuthRuntimeOptions } from "../src/auth-runtime";
import { AuthService } from "../src/auth-service";

const tempDirs: string[] = [];
const runtimes: AuthRuntime[] = [];

async function createRuntime(
  options: Partial<AuthRuntimeOptions> = {},
): Promise<AuthRuntime> {
  const storageDir = await mkdtemp(join(tmpdir(), "brains-auth-lifecycle-"));
  tempDirs.push(storageDir);
  const runtime = new AuthRuntime({
    storageDir,
    issuer: "https://brain.example.com",
    trustedIssuers: new Set(["https://brain.example.com"]),
    allowLocalhostIssuers: false,
    anchor: "team",
    anchorProfileEntityId: "profile:anchor",
    ...options,
  });
  runtimes.push(runtime);
  return runtime;
}

function expectReleased(runtime: AuthRuntime): void {
  expect(() => runtime.getUserStore()).toThrow(
    "Auth service has not been initialized",
  );
  expect(runtime["invitationDeliverySupervisor"]).toBeUndefined();
  expect(runtime["accountSettingsStore"]).toBeUndefined();
  expect(() => runtime["runtimeDatabase"].db).toThrow(
    "Auth runtime database has not been started",
  );
}

afterEach(async () => {
  try {
    await Promise.allSettled(
      runtimes.splice(0).map((runtime) => runtime.close()),
    );
  } finally {
    await Promise.all(
      tempDirs
        .splice(0)
        .map((dir) => rm(dir, { recursive: true, force: true })),
    );
  }
});

describe("AuthRuntime lifecycle", () => {
  it("shares service construction across concurrent lifecycle callers", async () => {
    const runtime = await createRuntime();
    const getInvitations = spyOn(runtime, "getInvitationService");
    const project = runtime["projectConfiguredBrainAnchor"];
    const projectAnchor = mock(project.bind(runtime));
    runtime["projectConfiguredBrainAnchor"] = projectAnchor;
    try {
      await Promise.all([
        runtime.initialize(),
        runtime.initialize(),
        runtime.ensureStarted(),
        runtime.ensureStarted(),
      ]);
      expect(getInvitations).toHaveBeenCalledTimes(2); // Construction and recovery.
      expect(projectAnchor).toHaveBeenCalledTimes(1);
    } finally {
      getInvitations.mockRestore();
      runtime["projectConfiguredBrainAnchor"] = project;
    }
  });

  it("drains database and service startup before releasing resources", async () => {
    const runtime = await createRuntime();
    const database = runtime["runtimeDatabase"];
    const entered = deferred();
    const release = deferred();
    const prepare = database["prepareLocalDatabasePath"];
    // Element access preserves the private seam's real signature.
    database["prepareLocalDatabasePath"] = async (): Promise<void> => {
      entered.resolve();
      await release.promise;
      await prepare.call(database);
    };
    const stopMaintenance = spyOn(
      runtime.oauthEndpoints,
      "stopClientMaintenance",
    );
    const initialization = runtime.initialize();
    await entered.promise;
    const closing = runtime.close();
    try {
      expect(runtime.close()).toBe(closing);
      expect(stopMaintenance).not.toHaveBeenCalled();
    } finally {
      release.resolve();
      const results = await Promise.allSettled([initialization, closing]);
      database["prepareLocalDatabasePath"] = prepare;
      stopMaintenance.mockRestore();
      expect(results.map((result) => result.status)).toEqual([
        "fulfilled",
        "fulfilled",
      ]);
    }
    expectReleased(runtime);
  });

  it.each(["getJwks", "getA2ASigningKey", "hasPasskeyCredentials"] as const)(
    "drains lazy %s database startup before shutdown",
    async (method) => {
      const storageDir = await mkdtemp(join(tmpdir(), "brains-auth-lazy-"));
      tempDirs.push(storageDir);
      const service = new AuthService({ storageDir });
      const runtime = service["runtime"];
      runtimes.push(runtime);
      const database = runtime["runtimeDatabase"];
      const entered = deferred();
      const release = deferred();
      const prepare = database["prepareLocalDatabasePath"];
      database["prepareLocalDatabasePath"] = async (): Promise<void> => {
        entered.resolve();
        await release.promise;
        await prepare.call(database);
      };
      const startup = service[method]();
      await entered.promise;
      const closing = runtime.close();
      release.resolve();
      try {
        const results = await Promise.allSettled([startup, closing]);
        expect(results.map((result) => result.status)).toEqual([
          "fulfilled",
          "fulfilled",
        ]);
        expectReleased(runtime);
      } finally {
        database["prepareLocalDatabasePath"] = prepare;
      }
    },
  );

  it("orders restart after shutdown without letting startup overtake it", async () => {
    const entered = deferred();
    const release = deferred();
    let profileCalls = 0;
    const events: string[] = [];
    const runtime = await createRuntime({
      resolveProfileDisplayName: async (): Promise<string> => {
        profileCalls += 1;
        events.push(`profile-${profileCalls}`);
        if (profileCalls === 1) {
          entered.resolve();
          await release.promise;
        }
        return "Anchor";
      },
    });
    const stop = runtime.oauthEndpoints.stopClientMaintenance.bind(
      runtime.oauthEndpoints,
    );
    const stopSpy = spyOn(
      runtime.oauthEndpoints,
      "stopClientMaintenance",
    ).mockImplementation(async (): Promise<void> => {
      events.push("stop");
      await stop();
    });
    const initialization = runtime.initialize();
    await entered.promise;
    const closing = runtime.close();
    const restart = runtime.initialize();
    release.resolve();
    try {
      const results = await Promise.allSettled([
        initialization,
        closing,
        restart,
      ]);
      expect(results.map((result) => result.status)).toEqual([
        "fulfilled",
        "fulfilled",
        "fulfilled",
      ]);
      expect(events).toEqual(["profile-1", "stop", "profile-2"]);
      expect(await runtime.getUserStore().getBrainAnchor()).toMatchObject({
        displayName: "Anchor",
      });
    } finally {
      stopSpy.mockRestore();
    }
  });

  it("rolls back partial initialization and permits a clean retry", async () => {
    const runtime = await createRuntime();
    const failure = new Error("Anchor projection failed");
    const project = runtime["projectConfiguredBrainAnchor"];
    runtime["projectConfiguredBrainAnchor"] = async (): Promise<void> => {
      throw failure;
    };
    const stopMaintenance = spyOn(
      runtime.oauthEndpoints,
      "stopClientMaintenance",
    );
    const stopDatabase = spyOn(runtime["runtimeDatabase"], "stop");
    try {
      expect(await runtime.initialize().catch((error: unknown) => error)).toBe(
        failure,
      );
      expect(stopMaintenance).toHaveBeenCalledTimes(1);
      expect(stopDatabase).toHaveBeenCalledTimes(1);
      expectReleased(runtime);
    } finally {
      runtime["projectConfiguredBrainAnchor"] = project;
      stopMaintenance.mockRestore();
      stopDatabase.mockRestore();
    }
    await runtime.initialize();
    expect(await runtime.getUserStore().getBrainAnchor()).toBeDefined();
  });

  it("settles both signing-key loads before failure rollback or shutdown", async () => {
    const runtime = await createRuntime();
    const entered = deferred();
    const release = deferred();
    const failure = new Error("OAuth key unavailable");
    let siblingFinished = false;
    const cleanupObservations: boolean[] = [];
    const oauthKey = spyOn(runtime.keyStore, "getPrivateJwk").mockRejectedValue(
      failure,
    );
    const loadA2AKey = runtime.a2aKeyStore.getPrivateJwk.bind(
      runtime.a2aKeyStore,
    );
    const a2aKey = spyOn(
      runtime.a2aKeyStore,
      "getPrivateJwk",
    ).mockImplementation(async () => {
      entered.resolve();
      await release.promise;
      const key = await loadA2AKey();
      siblingFinished = true;
      return key;
    });
    const stop = runtime.oauthEndpoints.stopClientMaintenance.bind(
      runtime.oauthEndpoints,
    );
    const stopSpy = spyOn(
      runtime.oauthEndpoints,
      "stopClientMaintenance",
    ).mockImplementation(async (): Promise<void> => {
      cleanupObservations.push(siblingFinished);
      await stop();
    });
    const initialization = runtime
      .initialize()
      .catch((error: unknown) => error);
    await entered.promise;
    const closing = runtime.close();
    release.resolve();
    try {
      expect(await initialization).toBe(failure);
      await closing;
      expect(cleanupObservations.length).toBeGreaterThan(0);
      expect(cleanupObservations.every(Boolean)).toBe(true);
      expectReleased(runtime);
    } finally {
      oauthKey.mockRestore();
      a2aKey.mockRestore();
      stopSpy.mockRestore();
    }
  });

  it("continues releasing resources when a supervisor close fails", async () => {
    const runtime = await createRuntime();
    await runtime.initialize();
    const supervisor = runtime["invitationDeliverySupervisor"];
    if (!supervisor) throw new Error("Missing invitation supervisor");
    const closeInvitations = spyOn(supervisor, "close");
    const stopDatabase = spyOn(runtime["runtimeDatabase"], "stop");
    const stop = runtime.oauthEndpoints.stopClientMaintenance.bind(
      runtime.oauthEndpoints,
    );
    const failure = new Error("Maintenance shutdown failed");
    const stopSpy = spyOn(
      runtime.oauthEndpoints,
      "stopClientMaintenance",
    ).mockImplementation(async (): Promise<void> => {
      await stop();
      throw failure;
    });
    try {
      expect(await runtime.close().catch((error: unknown) => error)).toBe(
        failure,
      );
      expect(closeInvitations).toHaveBeenCalledTimes(1);
      expect(stopDatabase).toHaveBeenCalledTimes(1);
      expectReleased(runtime);
    } finally {
      closeInvitations.mockRestore();
      stopDatabase.mockRestore();
      stopSpy.mockRestore();
    }
  });

  it("reports all supervisor shutdown failures after releasing the database", async () => {
    const runtime = await createRuntime();
    await runtime.initialize();
    const supervisor = runtime["invitationDeliverySupervisor"];
    if (!supervisor) throw new Error("Missing invitation supervisor");
    const maintenanceFailure = new Error("Maintenance close failed");
    const invitationFailure = new Error("Invitation close failed");
    const stop = runtime.oauthEndpoints.stopClientMaintenance.bind(
      runtime.oauthEndpoints,
    );
    const close = supervisor.close.bind(supervisor);
    const stopSpy = spyOn(
      runtime.oauthEndpoints,
      "stopClientMaintenance",
    ).mockImplementation(async (): Promise<void> => {
      await stop();
      throw maintenanceFailure;
    });
    const closeSpy = spyOn(supervisor, "close").mockImplementation(
      async (): Promise<void> => {
        await close();
        throw invitationFailure;
      },
    );
    try {
      const error = await runtime.close().catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(AggregateError);
      if (!(error instanceof AggregateError))
        throw new Error("Expected aggregate failure");
      expect(error.errors).toEqual([maintenanceFailure, invitationFailure]);
      expectReleased(runtime);
    } finally {
      stopSpy.mockRestore();
      closeSpy.mockRestore();
    }
  });

  it("drains explicitly admitted invitation recovery before shutdown", async () => {
    const runtime = await createRuntime({
      autoStartInvitationDeliveryRecovery: false,
    });
    await runtime.initialize();
    const supervisor = runtime["invitationDeliverySupervisor"];
    if (!supervisor) throw new Error("Missing invitation supervisor");
    const entered = deferred();
    const release = deferred();
    const start = supervisor.start.bind(supervisor);
    const startSpy = spyOn(supervisor, "start").mockImplementation(
      async (): Promise<void> => {
        entered.resolve();
        await release.promise;
        await start();
      },
    );
    const stopDatabase = spyOn(runtime["runtimeDatabase"], "stop");
    const recovery = runtime.startInvitationDeliveryRecovery();
    await entered.promise;
    const closing = runtime.close();
    try {
      expect(stopDatabase).not.toHaveBeenCalled();
    } finally {
      release.resolve();
      const results = await Promise.allSettled([recovery, closing]);
      startSpy.mockRestore();
      stopDatabase.mockRestore();
      expect(results.map((result) => result.status)).toEqual([
        "fulfilled",
        "fulfilled",
      ]);
    }
    expectReleased(runtime);
  });

  it("preserves admission order across multiple queued starts and closes", async () => {
    const runtime = await createRuntime();
    await Promise.all([
      runtime.initialize(),
      runtime.close(),
      runtime.initialize(),
      runtime.close(),
      runtime.ensureStarted(),
      runtime.close(),
    ]);
    expectReleased(runtime);
    await runtime.initialize();
    expect(await runtime.getUserStore().getBrainAnchor()).toBeDefined();
  });

  it("rolls back failed lazy service construction before retry", async () => {
    const runtime = await createRuntime();
    const failure = new Error("Service construction failed");
    const invitations = spyOn(
      runtime,
      "getInvitationService",
    ).mockImplementation((): never => {
      throw failure;
    });
    try {
      expect(
        await runtime.ensureStarted().catch((error: unknown) => error),
      ).toBe(failure);
      expectReleased(runtime);
    } finally {
      invitations.mockRestore();
    }
    await runtime.ensureStarted();
    expect(runtime.getAdministrationService()).toBeDefined();
  });

  it("reports startup and rollback failures without leaving the database open", async () => {
    const runtime = await createRuntime();
    const startupFailure = new Error("Startup failed");
    const cleanupFailure = new Error("Rollback failed");
    const project = runtime["projectConfiguredBrainAnchor"];
    runtime["projectConfiguredBrainAnchor"] = async (): Promise<void> => {
      throw startupFailure;
    };
    const stop = spyOn(
      runtime.oauthEndpoints,
      "stopClientMaintenance",
    ).mockRejectedValue(cleanupFailure);
    try {
      const error = await runtime
        .initialize()
        .catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(AggregateError);
      if (!(error instanceof AggregateError))
        throw new Error("Expected aggregate failure");
      expect(error.errors).toEqual([startupFailure, cleanupFailure]);
      expectReleased(runtime);
    } finally {
      runtime["projectConfiguredBrainAnchor"] = project;
      stop.mockRestore();
    }
    await runtime.initialize();
    expect(await runtime.getUserStore().getBrainAnchor()).toBeDefined();
  });

  it("releases the database after a synchronous supervisor close failure", async () => {
    const runtime = await createRuntime();
    await runtime.ensureStarted();
    const failure = new Error("Synchronous shutdown failure");
    const stop = spyOn(
      runtime.oauthEndpoints,
      "stopClientMaintenance",
    ).mockImplementation((): never => {
      throw failure;
    });
    try {
      expect(await runtime.close().catch((error: unknown) => error)).toBe(
        failure,
      );
      expectReleased(runtime);
    } finally {
      stop.mockRestore();
    }
    await runtime.initialize();
    expect(await runtime.getUserStore().getBrainAnchor()).toBeDefined();
  });

  it("recreates database-bound account settings after restart", async () => {
    const runtime = await createRuntime({
      accountSettingsEncryptionKey: "test-account-settings-encryption-key-0001",
    });
    await runtime.initialize();
    const settings = runtime.getAccountSettingsStore();
    expect(settings).toBeDefined();
    await runtime.close();
    expectReleased(runtime);
    await runtime.initialize();
    const restartedSettings = runtime.getAccountSettingsStore();
    expect(restartedSettings).toBeDefined();
    expect(restartedSettings).not.toBe(settings);
    expect(
      await restartedSettings?.read({
        packageName: "@brains/test",
        definitionId: "settings",
        actorId: "actor:test",
      }),
    ).toBeNull();
  });
});
