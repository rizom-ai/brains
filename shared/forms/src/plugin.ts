import {
  ServicePlugin,
  type BaseEntity,
  type ServicePluginContext,
  type WebRouteDefinition,
} from "@brains/plugins";
import { z } from "@brains/utils/zod";
import { formPolicyOverridesSchema } from "./policy";
import { FormService, type FormServiceOptions } from "./service";

/** A target plugin's configuration: the values its owner wants different
 * from the forms engine's policy. */
export const formPluginConfigSchema: z.ZodObject<
  { intake: z.ZodOptional<typeof formPolicyOverridesSchema> },
  z.core.$strict
> = z.strictObject({ intake: formPolicyOverridesSchema.optional() });
export type FormPluginConfig = z.input<typeof formPluginConfigSchema>;

export interface FormPluginOptions<E extends BaseEntity> extends Omit<
  FormServiceOptions<E>,
  "overrides"
> {
  id: string;
  packageJson: {
    name: string;
    version: string;
    description?: string;
  };
}

/**
 * A target package's service plugin: one `FormService` for its target, run
 * from the plugin's lifecycle. The target's entity plugin, notifications,
 * site-builder, Studio and the unified Inbox register first.
 */
export class FormPlugin<
  E extends BaseEntity = BaseEntity,
> extends ServicePlugin<FormPluginConfig, unknown> {
  readonly dependencies: string[];
  private readonly forms: FormService<E>;

  constructor(options: FormPluginOptions<E>, config: FormPluginConfig = {}) {
    super(options.id, options.packageJson, config, formPluginConfigSchema);
    // site-builder registers first, so it is listening when the site's form
    // pages are declared.
    this.dependencies = [
      options.target.entityType,
      "notifications",
      "site-builder",
      "studio",
      "unified-inbox",
    ];
    this.forms = new FormService({
      label: options.label,
      target: options.target,
      forms: options.forms,
      overrides: this.config.intake,
    });
  }

  protected override async onRegister(
    context: ServicePluginContext,
  ): Promise<void> {
    await this.forms.register(context, this.id);
  }

  override getWebRoutes(): WebRouteDefinition[] {
    return this.forms.webRoutes();
  }

  protected override async onReady(
    context: ServicePluginContext,
  ): Promise<void> {
    await this.forms.ready(context);
  }

  protected override async onShutdown(): Promise<void> {
    await this.forms.shutdown();
  }
}
