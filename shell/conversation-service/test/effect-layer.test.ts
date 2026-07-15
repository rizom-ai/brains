import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { Context, Effect, Exit, Layer, Scope } from "@brains/utils/effect";
import { MessageBus } from "@brains/messaging-service";
import { createSilentLogger } from "@brains/test-utils";
import { mkdtemp, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import {
  ConversationServiceTag,
  createConversationServiceLayer,
} from "../src/effect";
import { migrateConversations } from "../src/migrate";
import { ConversationService } from "../src/conversation-service";

const logger = createSilentLogger("conversation-effect-layer");
const messageBus = MessageBus.createFresh(logger);

function closeScope(scope: Scope.CloseableScope): void {
  Effect.runSync(Scope.close(scope, Exit.void));
}

async function expectClientClosed(promise: Promise<unknown>): Promise<void> {
  let closeError: unknown;
  try {
    await promise;
  } catch (error) {
    closeError = error;
  }
  const errorText =
    String(closeError) +
    (closeError instanceof Error && closeError.cause
      ? String(closeError.cause)
      : "");
  expect(errorText).toContain("CLIENT_CLOSED");
}

describe("conversation-service Effect layer", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "conversation-layer-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  async function createDatabaseUrl(name: string): Promise<string> {
    const url = `file:${join(tempDir, `${name}.db`)}`;
    await migrateConversations({ url }, logger);
    return url;
  }

  it("constructs independent services and closes only its own scope", async () => {
    const firstUrl = await createDatabaseUrl("first");
    const secondUrl = await createDatabaseUrl("second");
    const firstScope = Effect.runSync(Scope.make());
    const secondScope = Effect.runSync(Scope.make());

    const firstContext = Effect.runSync(
      Layer.buildWithScope(
        createConversationServiceLayer({
          dbConfig: { url: firstUrl },
          logger,
          messageBus,
        }),
        firstScope,
      ),
    );
    const secondContext = Effect.runSync(
      Layer.buildWithScope(
        createConversationServiceLayer({
          dbConfig: { url: secondUrl },
          logger,
          messageBus,
        }),
        secondScope,
      ),
    );
    const first = Context.get(firstContext, ConversationServiceTag);
    const second = Context.get(secondContext, ConversationServiceTag);

    expect(first).not.toBe(second);
    await first.startConversation({
      sessionId: "first",
      interfaceType: "test",
      channelId: "first",
      metadata: {
        channelName: "First",
        interfaceType: "test",
        channelId: "first",
      },
    });
    await second.startConversation({
      sessionId: "second",
      interfaceType: "test",
      channelId: "second",
      metadata: {
        channelName: "Second",
        interfaceType: "test",
        channelId: "second",
      },
    });

    closeScope(firstScope);
    await expectClientClosed(first.getConversation("first"));
    expect(await second.getConversation("second")).not.toBeNull();

    closeScope(secondScope);
  });

  it("owns an injected service and releases it exactly once", async () => {
    const url = await createDatabaseUrl("injected");
    const service = ConversationService.createFreshFromConfig(
      logger,
      messageBus,
      { url },
    );
    let closeCalls = 0;
    const closeService = service.close.bind(service);
    service.close = (): void => {
      closeCalls++;
      closeService();
    };

    const scope = Effect.runSync(Scope.make());
    const context = Effect.runSync(
      Layer.buildWithScope(
        createConversationServiceLayer({
          dbConfig: { url },
          logger,
          messageBus,
          service,
        }),
        scope,
      ),
    );

    expect(Context.get(context, ConversationServiceTag)).toBe(service);
    closeScope(scope);
    closeScope(scope);

    expect(closeCalls).toBe(1);
    await expectClientClosed(service.getConversation("missing"));
  });

  it("supports synchronous rollback before the service is used", async () => {
    const url = await createDatabaseUrl("rollback");
    const scope = Effect.runSync(Scope.make());
    const context = Effect.runSync(
      Layer.buildWithScope(
        createConversationServiceLayer({
          dbConfig: { url },
          logger,
          messageBus,
        }),
        scope,
      ),
    );
    const service = Context.get(context, ConversationServiceTag);

    closeScope(scope);

    await expectClientClosed(service.getConversation("missing"));
  });
});
