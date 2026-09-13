import { afterEach, test } from "bun:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { AuthServicePlugin, getActiveAuthService } from "@brains/auth-service";
import {
  AUTH_PRINCIPAL_RESOLVE_CHANNEL,
  AUTH_ACCOUNT_SETTINGS_READ_CHANNEL,
  authPrincipalResolveResponseSchema,
} from "@brains/contracts";
import { MessageBus } from "@brains/messaging-service";
import { createServicePluginContext } from "@brains/plugins";
import { createMockShell, createSilentLogger } from "@brains/test-utils";
import {
  LocalDatabaseRpcClient,
  LocalDatabaseRpcServer,
} from "../shell/core/src/local-database-endpoint";
import { registerAuthWorkerBridge } from "../shell/core/src/auth-worker-bridge";
import { createWorkerAccountSettingsBackend } from "../shell/auth-service/src/worker-account-settings";

const cleanups: (() => void | Promise<void>)[] = [];
let directory: string | undefined;
afterEach(async () => {
  const errors: unknown[] = [];
  for (const cleanup of cleanups.splice(0).reverse()) {
    try {
      await cleanup();
    } catch (error) {
      errors.push(error);
    }
  }
  if (errors.length)
    throw new AggregateError(errors, "Auth worker integration cleanup failed");
  if (directory) await rm(directory, { recursive: true, force: true });
  directory = undefined;
});

test("execution-only auth uses authenticated owner reads without local storage or administration", async () => {
  directory = await mkdtemp(join(tmpdir(), "brains-auth-worker-"));
  const config = {
    address: join(directory, "owner.sock"),
    secret: "s".repeat(48),
    sessionId: "auth-worker-test",
  };
  const server = new LocalDatabaseRpcServer({ config });
  cleanups.push(() => server.close());
  const client = new LocalDatabaseRpcClient({ config });
  cleanups.push(() => client.close());
  const ownerBus = MessageBus.createFresh(createSilentLogger());
  const workerBus = MessageBus.createFresh(createSilentLogger());
  cleanups.push(
    registerAuthWorkerBridge({
      messageBus: ownerBus,
      client: undefined,
      registerOwnerHandler: (service, handler) =>
        server.register(service, (payload, context) =>
          handler(payload, context.signal),
        ),
    }),
  );
  cleanups.push(
    registerAuthWorkerBridge({
      messageBus: workerBus,
      client,
      registerOwnerHandler: () => {},
    }),
  );
  await server.initialize();
  const ownerShell = {
    ...createMockShell(),
    getMessageBus: (): MessageBus => ownerBus,
  };
  const workerShell = {
    ...createMockShell(),
    getMessageBus: (): MessageBus => workerBus,
  };
  const owner = new AuthServicePlugin({
    storageDir: join(directory, "auth"),
    accountSettingsEncryptionKey: "k".repeat(32),
  });
  const shutdownOwner = owner.shutdown?.bind(owner);
  assert(shutdownOwner);
  cleanups.push(shutdownOwner);
  await owner.register(ownerShell);
  const service = owner.getService();
  const user = await service.createUser({
    displayName: "Worker account",
    role: "trusted",
    status: "active",
  });
  const backend = service.getAccountSettingsBackend();
  assert(backend);
  const identity = {
    packageName: "@fixture/worker",
    definitionId: "credentials",
    actorId: user.userId,
  };
  const stored = await backend.write(identity, { token: "test-worker-secret" });
  const workerPath = join(directory, "must-not-open");
  const worker = new AuthServicePlugin({ storageDir: workerPath });
  const shutdownWorker = worker.shutdown?.bind(worker);
  assert(shutdownWorker);
  cleanups.push(shutdownWorker);
  const capabilities = await worker.register(workerShell, {
    executionOnly: true,
  });
  await worker.finalizeRegistration();
  await worker.ready();
  assert.deepEqual(capabilities.tools, []);
  assert.deepEqual(worker.getWebRoutes(), []);
  assert.throws(() => worker.getService(), /control-plane process/);
  assert.equal(getActiveAuthService(), service);
  assert.equal(workerShell.getAccountSettingsRegistry().hasBackend(), true);
  await assert.rejects(stat(workerPath), { code: "ENOENT" });
  const remote = createWorkerAccountSettingsBackend(
    createServicePluginContext(workerShell, "auth-service", {
      executionOnly: true,
    }),
  );
  assert.deepEqual(await remote.read(identity), stored);
  assert.deepEqual(await remote.list(identity), [
    { actorId: user.userId, ...stored },
  ]);
  await assert.rejects(
    remote.write(identity, { token: "changed" }),
    /control-plane owner/,
  );
  await assert.rejects(remote.delete(identity), /control-plane owner/);
  await assert.rejects(remote.deleteActor(user.userId), /control-plane owner/);
  assert.deepEqual(await backend.read(identity), stored);
  const actor = { kind: "user", userId: user.userId };
  const principal = await workerBus.send({
    type: AUTH_PRINCIPAL_RESOLVE_CHANNEL,
    payload: { actor },
    sender: "test",
  });
  assert("success" in principal && principal.success);
  assert.equal(
    authPrincipalResolveResponseSchema.parse(principal.data).principal?.userId,
    user.userId,
  );
  assert.deepEqual(
    principal,
    await ownerBus.send({
      type: AUTH_PRINCIPAL_RESOLVE_CHANNEL,
      payload: { actor },
      sender: "test",
    }),
  );
  await assert.rejects(
    client.request("auth-worker", { channel: "auth:admin", payload: {} }),
  );
  await assert.rejects(
    client.request("auth-worker", {
      channel: AUTH_ACCOUNT_SETTINGS_READ_CHANNEL,
      payload: { ...identity, operation: "delete" },
    }),
  );
  assert.deepEqual(await remote.read(identity), stored);
  await shutdownWorker();
  assert.equal(workerShell.getAccountSettingsRegistry().hasBackend(), false);
  assert.equal(getActiveAuthService(), service);
  client.close();
  await assert.rejects(remote.read(identity));
});
