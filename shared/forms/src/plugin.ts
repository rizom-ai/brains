import type { BaseEntity } from "@brains/plugins";
import {
  defineServicePlugin,
  type ServicePackageDefinition,
} from "@brains/sdk/services";
import type { EntityDefinition } from "@brains/sdk/entities";
import {
  serviceRuntime,
  withJobHandlers,
  withWebRoutes,
} from "@brains/sdk/internal/service-runtime";
import { z } from "@brains/utils/zod";
import { formPolicyOverridesSchema } from "./policy";
import { FormService, type FormServiceOptions } from "./service";

/** A target package's configuration: the values its owner wants different
 * from the forms engine's policy. */
export const formPluginConfigSchema: z.ZodObject<
  { intake: z.ZodOptional<typeof formPolicyOverridesSchema> },
  z.core.$strict
> = z.strictObject({ intake: formPolicyOverridesSchema.optional() });
export type FormPluginConfig = z.input<typeof formPluginConfigSchema>;

export interface FormPackageOptions<E extends BaseEntity> extends Omit<
  FormServiceOptions<E>,
  "overrides"
> {
  /** The service's plugin id, such as "contact". */
  id: string;
  /** The target's declared type, which the package owns. */
  entity: EntityDefinition;
}

/** What a target package holds once set up: its one form service. */
export interface FormPackageState<E extends BaseEntity = BaseEntity> {
  readonly forms: FormService<E>;
}

/**
 * The plugins a target package's service registers after, as the forms
 * engine's service class declared them: its target's type, notifications,
 * site-builder (listening when the site's form pages are declared), Studio
 * and the unified Inbox. The composer installs the service with them.
 */
export function formPackageDependencies(entityType: string): string[] {
  return [
    entityType,
    "notifications",
    "site-builder",
    "studio",
    "unified-inbox",
  ];
}

/**
 * A target package: its declared type and one `FormService` for its
 * target, run from the service's lifecycle. Its routes serve the forms;
 * its notify job alerts the owner; once the brain is ready it serves.
 */
export function defineFormPackage<E extends BaseEntity>(
  options: FormPackageOptions<E>,
): ServicePackageDefinition<typeof formPluginConfigSchema> {
  const service = defineServicePlugin({
    id: options.id,
    config: formPluginConfigSchema,
    entities: [options.entity],
    setup: async (context): Promise<FormPackageState<E>> => {
      const runtime = serviceRuntime(context);
      const forms = new FormService<E>({
        label: options.label,
        target: options.target,
        forms: options.forms,
        overrides: context.config.intake,
      });
      await forms.register(runtime);
      runtime.ready(() => forms.ready());
      context.lifecycle.onCleanup(() => forms.shutdown());
      return { forms };
    },
  });
  return withJobHandlers<typeof formPluginConfigSchema, FormPackageState<E>>(
    withWebRoutes<typeof formPluginConfigSchema, FormPackageState<E>>(
      service,
      ({ state }) => state.forms.webRoutes(),
    ),
    ({ state }) => [state.forms.notificationJob()],
  );
}
