import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import {
  LocalDatabaseRpcClient,
  LocalDatabaseRpcServer,
  type LocalDatabaseEndpointConfig,
} from "@brains/core";
import {
  ENTITY_RPC_SERVICE,
  ENTITY_BINARY_CONTROL_SERVICE,
  ENTITY_PUBLICATION_SERVICE,
  PROJECTION_STORE_RPC_SERVICE,
  RemoteEntityService,
  createEntityRpcHandler,
  createEntityBinaryRpcHandlers,
  handleProjectionStoreRpcRequest,
  parseEntityRpcCall,
  type EntityService,
} from "@brains/entity-service";

type RemoteOptions = Omit<
  ConstructorParameters<typeof RemoteEntityService>[0],
  "transport" | "projectionTransport" | "binaryTransport"
>;

export interface EntityOwnerConnection {
  service: RemoteEntityService;
  client: LocalDatabaseRpcClient;
  close(): void;
}

export interface EntityOwnerEndpoint {
  config: LocalDatabaseEndpointConfig;
  connect(options: RemoteOptions): Promise<EntityOwnerConnection>;
  /** Retire borrowers and join endpoint requests before the caller closes its owner. */
  close(): Promise<void>;
}

/** Borrow a native owner; never open a database in the calling process. */
export async function connectEntityOwnerEndpoint(
  config: LocalDatabaseEndpointConfig,
  options: RemoteOptions,
): Promise<EntityOwnerConnection> {
  const client = new LocalDatabaseRpcClient({
    config: { ...config, sessionId: randomUUID() },
  });
  const transport = (
    name: string,
  ): {
    initialize(): Promise<void>;
    close(): void;
    request(
      payload: unknown,
      options?: { signal?: AbortSignal | undefined },
    ): Promise<unknown>;
  } => ({
    initialize: () => client.initialize(),
    close: () => undefined,
    request: (payload, requestOptions) =>
      client.request(name, payload, requestOptions),
  });
  const service = new RemoteEntityService({
    ...options,
    transport: transport(ENTITY_RPC_SERVICE),
    projectionTransport: transport(PROJECTION_STORE_RPC_SERVICE),
    binaryTransport: {
      invalidate: (): void => client.close(),
      control: (payload, requestOptions): Promise<unknown> =>
        client.request(ENTITY_BINARY_CONTROL_SERVICE, payload, requestOptions),
      publication: (payload, requestOptions): Promise<unknown> =>
        client.request(ENTITY_PUBLICATION_SERVICE, payload, requestOptions),
    },
  });
  const close = (): void => {
    service.close();
    client.close();
  };
  try {
    await service.initialize();
    return { service, client, close };
  } catch (error) {
    close();
    throw error;
  }
}

/** Authenticated production wire protocol around an EXISTING native owner. */
export async function startEntityOwnerEndpoint(
  owner: EntityService,
): Promise<EntityOwnerEndpoint> {
  const dir = await mkdtemp(join(tmpdir(), "te-"));
  const config = {
    address: join(dir, "owner.sock"),
    secret: randomBytes(32).toString("hex"),
    sessionId: randomUUID(),
  };
  const server = new LocalDatabaseRpcServer({ config });
  const connections: EntityOwnerConnection[] = [];
  const handleEntity = createEntityRpcHandler(owner);
  server.register(ENTITY_RPC_SERVICE, (payload, context) => {
    const call = parseEntityRpcCall(payload);
    const dispatch = (): Promise<unknown> =>
      handleEntity(call.request, context.signal, context.connectionSignal);
    return call.batchScope
      ? owner.getProjectionStore().runInBatchScope(call.batchScope, dispatch)
      : dispatch();
  });
  server.register(PROJECTION_STORE_RPC_SERVICE, (payload, context) =>
    handleProjectionStoreRpcRequest(
      owner.getProjectionStore(),
      payload,
      context.signal,
    ),
  );
  const binary = owner.getBinaryPersistence();
  if (binary) {
    const handlers = createEntityBinaryRpcHandlers(owner, binary);
    server.register(ENTITY_BINARY_CONTROL_SERVICE, (payload, context) =>
      handlers.control(payload, context.signal, context.connectionSignal),
    );
    server.register(ENTITY_PUBLICATION_SERVICE, (payload, context) =>
      handlers.publication(payload, context.signal, context.connectionSignal),
    );
  }
  let closing: Promise<void> | undefined;
  const isClosing = (): boolean => closing !== undefined;
  const close = (): Promise<void> => {
    closing ??= (async (): Promise<void> => {
      for (const connection of connections) connection.close();
      await server.close();
      await rm(dir, { recursive: true, force: true });
    })();
    return closing;
  };
  try {
    await server.initialize();
  } catch (error) {
    const [retirement] = await Promise.allSettled([close()]);
    if (retirement.status === "rejected") {
      const cleanupError: unknown = retirement.reason;
      throw new AggregateError(
        [error, cleanupError],
        "Entity endpoint startup and retirement failed",
        { cause: error },
      );
    }
    throw error;
  }
  return {
    config,
    close,
    connect: async (options): Promise<EntityOwnerConnection> => {
      if (isClosing()) throw new Error("Entity owner endpoint is closed");
      const connection = await connectEntityOwnerEndpoint(config, options);
      if (isClosing()) {
        connection.close();
        throw new Error("Entity owner endpoint closed during connection");
      }
      connections.push(connection);
      return connection;
    },
  };
}
