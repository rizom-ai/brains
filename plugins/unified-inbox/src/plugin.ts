import {
  ServicePlugin,
  type Plugin,
  type ServicePluginContext,
} from "@brains/plugins";
import { z } from "@brains/utils/zod";
import packageJson from "../package.json";
import { InboxDataSource } from "./inbox-datasource";

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
  constructor() {
    super("unified-inbox", packageJson, {}, unifiedInboxConfigSchema);
  }

  protected override async onRegister(
    context: ServicePluginContext,
  ): Promise<void> {
    context.entities.registerDataSource(new InboxDataSource(context.inbox));
  }
}

export function unifiedInboxPlugin(): Plugin {
  return new UnifiedInboxPlugin();
}
