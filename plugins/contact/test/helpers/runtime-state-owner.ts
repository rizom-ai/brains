import { randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalDatabaseRpcClient, LocalDatabaseRpcServer } from "@brains/core";
import {
  RuntimeStateService,
  RemoteRuntimeStateService,
  RUNTIME_STATE_RPC_SERVICE,
  handleRuntimeStateRpcRequest,
} from "@brains/runtime-state";

interface RuntimeStateOwner {
  connect(): Promise<RemoteRuntimeStateService>;
  close(): Promise<void>;
}

/** Two callers borrow one native owner; no caller opens the storage file. */
export async function openRuntimeStateOwner(config: {
  url: string;
}): Promise<RuntimeStateOwner> {
  const directory = await mkdtemp(join(tmpdir(), "cr-"));
  const endpoint = {
    address: join(directory, "owner.sock"),
    secret: randomBytes(32).toString("hex"),
    sessionId: randomUUID(),
  };
  const owner = RuntimeStateService.createFresh(config);
  const server = new LocalDatabaseRpcServer({ config: endpoint });
  const clients: RemoteRuntimeStateService[] = [];
  server.register(RUNTIME_STATE_RPC_SERVICE, (payload, context) =>
    handleRuntimeStateRpcRequest(owner, payload, context.signal),
  );
  let closing: Promise<void> | undefined;
  const close = (): Promise<void> => {
    closing ??= (async (): Promise<void> => {
      for (const client of clients) client.close();
      await server.close();
      await owner.closeAsync();
      await rm(directory, { recursive: true, force: true });
    })();
    return closing;
  };
  try {
    await owner.initialize();
    await server.initialize();
  } catch (error) {
    const [retirement] = await Promise.allSettled([close()]);
    if (retirement.status === "rejected") {
      const cleanupError: unknown = retirement.reason;
      throw new AggregateError(
        [error, cleanupError],
        "Runtime-state test startup and retirement failed",
        { cause: error },
      );
    }
    throw error;
  }
  return {
    close,
    connect: async (): Promise<RemoteRuntimeStateService> => {
      if (closing) throw new Error("Runtime-state owner is closed");
      const client = new LocalDatabaseRpcClient({
        config: { ...endpoint, sessionId: randomUUID() },
      });
      const service = new RemoteRuntimeStateService({
        initialize: (): Promise<void> => client.initialize(),
        close: (): void => client.close(),
        request: (payload, options): Promise<unknown> =>
          client.request(RUNTIME_STATE_RPC_SERVICE, payload, options),
      });
      clients.push(service);
      await client.initialize();
      await service.initialize();
      return service;
    },
  };
}
