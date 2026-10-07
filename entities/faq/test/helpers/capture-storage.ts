import { RuntimeStateService } from "@brains/runtime-state";
import { migrateRuntimeState } from "@brains/runtime-state/migrate";
import type { Message } from "@brains/plugins";
import { createSilentLogger } from "@brains/test-utils";
import { createTestEntityAccess } from "@brains/plugins/test";
import type { FaqClassification } from "../../src/schemas/capture";
import { captureOwnedFaq } from "../../src/lib/owned-capture";
import { classifyExchange } from "../../src/lib/faq-classification";
import { findSameFaq } from "../../src/lib/faq-matching";
import { SAME_QUESTION_CHECK } from "../../src/lib/faq-question";
import { capturedReplyStore } from "../../src/lib/captured-replies";
import { openFoldStorage } from "./fold-storage";
import type { EntityService } from "@brains/entity-service";

export const captureData = {
  conversationId: "conversation",
  messageId: "reply",
  userPermissionLevel: "public" as const,
  position: 2,
};
export interface CaptureFixture {
  service: EntityService;
  replies: ReturnType<typeof capturedReplyStore>;
  process: () => ReturnType<typeof captureOwnedFaq>;
  close: () => void;
}
export async function openCaptureStorage(
  dir: string,
  options: {
    classify?: () => Promise<void>;
    targetId?: string;
    classification?: FaqClassification;
    replyMetadata?: Message["metadata"];
  } = {},
): Promise<CaptureFixture> {
  const logger = createSilentLogger();
  const config = { url: `file:${dir}/state.db` };
  await migrateRuntimeState(config, logger);
  const state = RuntimeStateService.createFresh(config, logger);
  await state.initialize();
  const replies = capturedReplyStore(state);
  const service = await openFoldStorage(dir);
  await service.initialize();
  const messages: Message[] = [
    {
      id: "question",
      conversationId: "conversation",
      role: "user",
      content: "What do you offer?",
      timestamp: new Date().toISOString(),
      metadata: {},
    },
    {
      id: "reply",
      conversationId: "conversation",
      role: "assistant",
      content: "An example service.",
      timestamp: new Date().toISOString(),
      metadata: options.replyMetadata ?? {},
    },
  ];
  const deps = {
    entityService: service,
    sameQuestionDistance: 0.2,
    searchWithDistances: async (): ReturnType<
      EntityService["searchWithDistances"]
    > =>
      options.targetId
        ? [{ entityId: options.targetId, entityType: "faq", distance: 0.01 }]
        : [],
    ai: {
      generateObject: async <T>(
        _prompt: string,
        schema: { parse(value: unknown): T },
      ): Promise<{ object: T }> => {
        if (_prompt.startsWith(SAME_QUESTION_CHECK))
          return { object: schema.parse({ same: true }) };
        await options.classify?.();
        return {
          object: schema.parse(
            options.classification ?? {
              reusable: true,
              question: "What do you offer?",
              answer: "An example service.",
            },
          ),
        };
      },
    },
  };
  // Deterministic candidate scores; entity lookups and mutations still use SQLite.
  service.searchWithDistances = deps.searchWithDistances;
  const { mutations, nearest } = createTestEntityAccess({
    entityService: service,
    ownedTypes: ["faq"],
    owner: "@brains/faq",
    declarationId: "capture",
  });
  return {
    replies,
    service,
    process: () =>
      captureOwnedFaq(captureData, {
        mutations,
        wasClaimed: (key) => replies.has(key),
        messages: async () => messages,
        classify: (question, answer) =>
          classifyExchange(deps.ai, question, answer),
        findSame: (request) =>
          findSameFaq(
            {
              nearest,
              ai: deps.ai,
              sameQuestionDistance: deps.sameQuestionDistance,
            },
            request,
          ),
      }),
    close: (): void => {
      service.close();
      state.close();
    },
  };
}
