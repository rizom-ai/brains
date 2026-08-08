import {
  ServicePlugin,
  type Plugin,
  type ServicePluginContext,
  type Tool,
} from "@brains/plugins";
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

  constructor() {
    super("unified-inbox", packageJson, {}, unifiedInboxConfigSchema);
  }

  protected override async onRegister(
    context: ServicePluginContext,
  ): Promise<void> {
    this.dataSource = new InboxDataSource(context.inbox);
    this.operator = new InboxOperatorService(context.inbox, this.dataSource);
    context.entities.registerDataSource(this.dataSource);
  }

  protected override async onReady(
    context: ServicePluginContext,
  ): Promise<void> {
    const dataSource = this.getDataSource();
    const operator = this.getOperator();
    const workspaceUrl = await registerUnifiedInboxCmsWorkspace(
      context,
      operator,
    );
    await registerUnifiedInboxDashboardWidget(context, operator, workspaceUrl);
    registerUnifiedInboxDigest(context, dataSource, undefined, workspaceUrl);
  }

  protected override async getTools(): Promise<Tool[]> {
    return [createInboxListTool(this.getOperator())];
  }

  private getDataSource(): InboxDataSource {
    if (!this.dataSource) {
      throw new Error("Unified inbox DataSource is not initialized");
    }
    return this.dataSource;
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
