import type { TopicsContext } from "./topics-context";
import type { Logger } from "@brains/utils/logger";
import type { ExtractedTopicData } from "../schemas/extraction";
import type { TopicEntity } from "../types";
import { topicDocument } from "./topic-document";
import {
  topicMergeSynthesisSchema,
  type TopicMergeSynthesisResult,
} from "../templates/merge-synthesis-template";

const adapter = topicDocument;

export interface ITopicMergeSynthesizer {
  synthesize(
    params: {
      existingTopic: TopicEntity;
      incomingTopic: ExtractedTopicData;
    },
    signal?: AbortSignal,
  ): Promise<TopicMergeSynthesisResult>;
}

export class TopicMergeSynthesizer implements ITopicMergeSynthesizer {
  private readonly context: TopicsContext;
  private readonly logger: Logger;
  constructor(context: TopicsContext, logger: Logger) {
    this.context = context;
    this.logger = logger;
  }

  async synthesize(
    params: {
      existingTopic: TopicEntity;
      incomingTopic: ExtractedTopicData;
    },
    signal?: AbortSignal,
  ): Promise<TopicMergeSynthesisResult> {
    const existingParsed = adapter.parseTopicBody(params.existingTopic.content);

    this.logger.debug("Synthesizing merged topic", {
      existingTitle: existingParsed.title,
      incomingTitle: params.incomingTopic.title,
    });

    return this.context.ai.generate(
      {
        templateName: "topics:merge-synthesis",
        representedIdentity: "none",
        prompt: `Canonical topic candidate:
Title: ${existingParsed.title}
Content:
${existingParsed.content}

Incoming topic candidate:
Title: ${params.incomingTopic.title}
Content:
${params.incomingTopic.content}`,
      },
      topicMergeSynthesisSchema,
      signal,
    );
  }
}
