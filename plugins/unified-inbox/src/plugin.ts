import {
  ServicePlugin,
  type Plugin,
  type ServicePluginContext,
  type Tool,
} from "@brains/plugins";
import { normalizeSameOriginPath } from "@brains/plugins/internal/same-origin-path";
import { z } from "@brains/utils/zod";
import packageJson from "../package.json";
import { registerUnifiedInboxDashboardWidget } from "./dashboard-widget";
import { InboxDataSource } from "./inbox-datasource";
import { registerUnifiedInboxDigest } from "./digest";
import { createInboxListTool } from "./inbox-tool";
import { registerUnifiedInboxCmsWorkspace } from "./operator-cms";
import { InboxOperatorService } from "./operator-service";

type UnifiedInboxConfig = Record<string, never>;
type UnifiedInboxConfigInput = Record<string, unknown>;

const unifiedInboxConfigSchema: z.ZodType<
  UnifiedInboxConfig,
  UnifiedInboxConfigInput
> = z.strictObject({});

export class UnifiedInboxPlugin extends ServicePlugin<
  UnifiedInboxConfig,
  UnifiedInboxConfigInput
> {
  private dataSource: InboxDataSource | undefined;
  private operator: InboxOperatorService | undefined;
  private pluginContext: ServicePluginContext | undefined;
  private cmsWorkspaceUrl: string | undefined;
  private cmsRegistered = false;

  constructor() {
    super("unified-inbox", packageJson, {}, unifiedInboxConfigSchema);
  }

  protected override async onRegister(
    context: ServicePluginContext,
  ): Promise<void> {
    this.pluginContext = context;
    this.dataSource = new InboxDataSource(context.inbox);
    this.operator = new InboxOperatorService(
      context.inbox,
      this.dataSource,
      context.inboxFollowUps,
    );
    context.entities.registerDataSource(this.dataSource);
    registerUnifiedInboxDigest(context, this.dataSource, {
      workspaceUrl: () => this.cmsWorkspaceUrl,
    });
  }

  protected override async onReady(
    context: ServicePluginContext,
  ): Promise<void> {
    const operator = this.getOperator();
    this.cmsWorkspaceUrl = normalizeSameOriginPath(
      await registerUnifiedInboxCmsWorkspace(context, operator),
    );
    this.cmsRegistered = this.cmsWorkspaceUrl !== undefined;
    if (this.cmsWorkspaceUrl) {
      context.interactions.register({
        id: "unified-inbox",
        label: "Inbox",
        description: "Review source-owned items that need operator attention.",
        href: this.cmsWorkspaceUrl,
        kind: "admin",
        priority: 20,
        visibility: "admin",
      });
    }
    await registerUnifiedInboxDashboardWidget(context, operator);
  }

  protected override async onShutdown(): Promise<void> {
    if (this.cmsRegistered) {
      await this.pluginContext?.cms.unregisterWorkspace("unified-inbox:inbox");
      this.cmsRegistered = false;
    }
    this.cmsWorkspaceUrl = undefined;
  }

  protected override async getTools(): Promise<Tool[]> {
    return [createInboxListTool(this.getOperator())];
  }

  private getOperator(): InboxOperatorService {
    if (!this.operator) {
      throw new Error("Unified inbox operator is not initialized");
    }
    return this.operator;
  }
}

export function unifiedInboxPlugin(): Plugin {
  return new UnifiedInboxPlugin();
}
