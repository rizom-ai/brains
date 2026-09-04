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
import { registerUnifiedInboxStudioWorkspace } from "./operator-studio";
import { InboxOperatorService } from "./operator-service";

const unifiedInboxConfigSchema: z.ZodObject<
  Record<never, never>,
  z.core.$strict
> = z.strictObject({});

type UnifiedInboxConfig = z.output<typeof unifiedInboxConfigSchema>;
/** Brains pass raw config records; the strict schema rejects any key at parse time. */
type UnifiedInboxConfigInput = Record<string, unknown>;

export class UnifiedInboxPlugin extends ServicePlugin<
  UnifiedInboxConfig,
  UnifiedInboxConfigInput
> {
  private dataSource: InboxDataSource | undefined;
  private operator: InboxOperatorService | undefined;
  private pluginContext: ServicePluginContext | undefined;
  private studioWorkspaceUrl: string | undefined;
  private studioRegistered = false;

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
      workspaceUrl: () => this.studioWorkspaceUrl,
    });
  }

  protected override async onReady(
    context: ServicePluginContext,
  ): Promise<void> {
    const operator = this.getOperator();
    this.studioWorkspaceUrl = normalizeSameOriginPath(
      await registerUnifiedInboxStudioWorkspace(context, operator),
    );
    this.studioRegistered = this.studioWorkspaceUrl !== undefined;
    if (this.studioWorkspaceUrl) {
      context.interactions.register({
        id: "unified-inbox",
        label: "Inbox",
        description: "Review source-owned items that need operator attention.",
        href: this.studioWorkspaceUrl,
        kind: "admin",
        priority: 20,
        visibility: "admin",
      });
    }
    await registerUnifiedInboxDashboardWidget(context, operator);
  }

  protected override async onShutdown(): Promise<void> {
    if (this.studioRegistered) {
      await this.pluginContext?.studio.unregisterWorkspace(
        "unified-inbox:inbox",
      );
      this.studioRegistered = false;
    }
    this.studioWorkspaceUrl = undefined;
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
