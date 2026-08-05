import { getActiveAuthService } from "@brains/auth-service";
import {
  ServicePlugin,
  type Plugin,
  type ServicePluginContext,
  type Tool,
  type WebRouteDefinition,
} from "@brains/plugins";
import { z } from "@brains/utils/zod";
import packageJson from "../package.json";
import { createInboxActionRoute } from "./action-route";
import { registerUnifiedInboxDashboardWidget } from "./dashboard-widget";
import { InboxDataSource } from "./inbox-datasource";
import { registerUnifiedInboxDigest } from "./digest";
import { createInboxListTool } from "./inbox-tool";
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
    await registerUnifiedInboxDashboardWidget(context, dataSource);
    registerUnifiedInboxDigest(context, dataSource);
  }

  protected override async getTools(): Promise<Tool[]> {
    return [createInboxListTool(this.getOperator())];
  }

  override getWebRoutes(): WebRouteDefinition[] {
    return [
      createInboxActionRoute({
        getOperator: () => this.getOperator(),
        resolvePrincipal: async (request) =>
          getActiveAuthService()?.resolveSession(request),
      }),
    ];
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
