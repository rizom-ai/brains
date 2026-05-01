import {
  AgentService,
  AIService,
  OnlineEmbeddingProvider,
} from "@brains/ai-service";
import { ConversationService } from "@brains/conversation-service";
import {
  DataSourceRegistry,
  EntityRegistry,
  EntityService,
} from "@brains/entity-service";
import {
  AnchorProfileService,
  BrainCharacterService,
} from "@brains/identity-service";
import {
  BatchJobManager,
  JobProgressMonitor,
  JobQueueService,
  JobQueueWorker,
} from "@brains/job-queue";
import { MCPService } from "@brains/mcp-service";
import { MessageBus } from "@brains/messaging-service";
import { PluginManager } from "@brains/plugins";
import { RenderService, TemplateRegistry } from "@brains/templates";

import { DaemonRegistry } from "../daemon-registry";

export function resetCoreServiceSingletons(): void {
  EntityService.resetInstance();
  EntityRegistry.resetInstance();
  DataSourceRegistry.resetInstance();
  OnlineEmbeddingProvider.resetInstance();
  ConversationService.resetInstance();
  PluginManager.resetInstance();
  MCPService.resetInstance();
  MessageBus.resetInstance();
  TemplateRegistry.resetInstance();
  RenderService.resetInstance();
  DaemonRegistry.resetInstance();
  AIService.resetInstance();
  AgentService.resetInstance();
  BrainCharacterService.resetInstance();
  AnchorProfileService.resetInstance();
  JobQueueService.resetInstance();
  BatchJobManager.resetInstance();
  JobQueueWorker.resetInstance();
  JobProgressMonitor.resetInstance();
}
