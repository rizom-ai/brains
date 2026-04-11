import type { EntityPluginContext } from "@brains/plugins";
import type { Logger } from "@brains/utils";
import type { ExtractedTopicData } from "../schemas/extraction";
import type { TopicEntity } from "../types";
import { TopicAdapter } from "./topic-adapter";
import type { TopicMergeSynthesisResult } from "../templates/merge-synthesis-template";

const adapter = new TopicAdapter();

export interface ITopicMergeSynthesizer {
  synthesize(params: {
    existingTopic: TopicEntity;
    incomingTopic: ExtractedTopicData;
  }): Promise<TopicMergeSynthesisResult>;
}

export class TopicMergeSynthesizer implements ITopicMergeSynthesizer {
  constructor(
    private readonly context: EntityPluginContext,
    private readonly logger: Logger,
  ) {}

  async synthesize(params: {
    existingTopic: TopicEntity;
    incomingTopic: ExtractedTopicData;
  }): Promise<TopicMergeSynthesisResult> {
    const existingParsed = adapter.parseTopicBody(params.existingTopic.content);

    this.logger.debug("Synthesizing merged topic", {
      existingTitle: existingParsed.title,
      incomingTitle: params.incomingTopic.title,
    });

    return this.context.ai.generate<TopicMergeSynthesisResult>({
      templateName: "topics:merge-synthesis",
      prompt: `Canonical topic candidate:
Title: ${existingParsed.title}
Keywords: ${existingParsed.keywords.join(", ")}
Content:
${existingParsed.content}

Incoming topic candidate:
Title: ${params.incomingTopic.title}
Keywords: ${params.incomingTopic.keywords.join(", ")}
Content:
${params.incomingTopic.content}`,
    });
  }
}
