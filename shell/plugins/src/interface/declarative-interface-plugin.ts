import type { UserPermissionLevel } from "@brains/templates";
import type { AnyAccountSettingsDefinition } from "../operator/account-settings-definition-contract";
import { createAccountDaemon } from "../operator/account-daemon-supervisor";
import type { AccountSettingsRegistration } from "../operator/account-settings-registry";
import type { z } from "@brains/utils/zod";
import {
  identityConfigSchema,
  type InstalledPluginPackageMetadata,
} from "../package-definition";
import type {
  AnyInterfaceRouteDefinition,
  InterfaceCaller,
  InterfaceDefinitionInput,
  InterfaceJobs,
} from "./interface-definition-contract";
import type { AnyServiceJobDefinition } from "../service/service-definition-contract";
import { getServiceJobRuntimeType } from "../service/job-definition-runtime";
import {
  jsonError,
  jsonResponse,
  type WebRouteDefinition,
} from "../types/web-routes";
import { createDeclarativeDaemon } from "./declarative-daemon";
import type { InterfacePluginContext } from "./context";
import { InterfacePlugin } from "./interface-plugin";

class DeclarativeInterfacePlugin<
  TConfigSchema extends z.ZodType<object, object>,
  TAccountSettings extends AnyAccountSettingsDefinition | undefined,
> extends InterfacePlugin<z.output<TConfigSchema>, z.output<TConfigSchema>> {
  private readonly definition: InterfaceDefinitionInput<
    TConfigSchema,
    TAccountSettings
  >;
  private accountSettingsRegistration: AccountSettingsRegistration | undefined;
  private routes: WebRouteDefinition[] = [];
  private hasRequiredDaemon = false;

  constructor(
    definition: InterfaceDefinitionInput<TConfigSchema, TAccountSettings>,
    config: z.output<TConfigSchema>,
    metadata: InstalledPluginPackageMetadata,
    id: string,
  ) {
    super(id, metadata, config, identityConfigSchema());
    this.definition = definition;
  }

  protected override async onRegister(
    context: InterfacePluginContext,
  ): Promise<void> {
    await super.onRegister(context);
    if (this.definition.accountSettings) {
      this.accountSettingsRegistration = context.accountSettings.register({
        ownerPluginId: this.id,
        packageName: this.packageName,
        definitionId: this.definition.id,
        definition: this.definition.accountSettings,
      });
    }
    const jobs = this.jobs(context);
    const routeDefinitions =
      this.definition.routes?.({ config: this.config, jobs }) ?? [];
    this.routes = routeDefinitions.map((route) =>
      this.runtimeRoute(route, context),
    );

    const daemonDefinitions =
      this.definition.daemons?.({ config: this.config, jobs }) ?? [];
    const daemonIds = new Set<string>();
    for (const daemon of daemonDefinitions) {
      if (daemonIds.has(daemon.id)) {
        throw new Error(
          `Interface "${this.definition.id}" defines daemon "${daemon.id}" more than once`,
        );
      }
      daemonIds.add(daemon.id);
      this.hasRequiredDaemon ||= daemon.required;
      if (daemon.forAccounts) {
        if (daemon.forAccounts !== this.definition.accountSettings) {
          throw new Error(
            `Interface "${this.definition.id}" account-bound daemon "${daemon.id}" must reference its attached account settings`,
          );
        }
        const registration = this.accountSettingsRegistration;
        if (!registration) {
          throw new Error(
            `Interface "${this.definition.id}" account-bound daemon "${daemon.id}" has no registered account settings`,
          );
        }
        context.daemons.register(
          daemon.id,
          createAccountDaemon(daemon, registration, context.accountSettings),
        );
        continue;
      }
      context.daemons.register(daemon.id, createDeclarativeDaemon(daemon));
    }
  }

  protected override async onRegistrationComplete(
    context: InterfacePluginContext,
  ): Promise<void> {
    if (
      this.accountSettingsRegistration &&
      !context.accountSettings.hasBackend()
    ) {
      throw new Error(
        `Interface "${this.definition.id}" account settings require auth-service and an account settings encryption key`,
      );
    }
  }

  override getWebRoutes(): WebRouteDefinition[] {
    return [...this.routes];
  }

  override requiresDaemonStartup(): boolean {
    return this.hasRequiredDaemon;
  }

  protected override async onShutdown(): Promise<void> {
    this.accountSettingsRegistration = undefined;
    this.routes = [];
    this.hasRequiredDaemon = false;
    await super.onShutdown();
  }

  private jobs(context: InterfacePluginContext): InterfaceJobs {
    return {
      enqueue: async <TDefinition extends AnyServiceJobDefinition>(
        definition: TDefinition,
        input: z.input<TDefinition["input"]>,
      ): Promise<{ readonly id: string }> => {
        const data = definition.input.parse(input);
        const id = await context.jobs.enqueue({
          type: getServiceJobRuntimeType(definition),
          data,
        });
        return Object.freeze({ id });
      },
    };
  }

  private runtimeRoute(
    definition: AnyInterfaceRouteDefinition,
    context: InterfacePluginContext,
  ): WebRouteDefinition {
    return {
      method: definition.method,
      path: definition.path,
      public: true,
      handler: async (request): Promise<Response> => {
        const caller = await this.resolveCaller(definition, request, context);
        if (definition.security.kind === "protocol" && !caller) {
          return jsonError("Unauthorized", 401);
        }

        let body: unknown;
        if (definition.body) {
          let payload: unknown;
          try {
            payload = await request.json();
          } catch {
            return jsonError("Request body must be valid JSON", 400);
          }
          const parsed = definition.body.safeParse(payload);
          if (!parsed.success) {
            return jsonError("Request body is invalid", 400);
          }
          body = parsed.data;
        }

        const output = await definition.handle({
          request,
          body,
          caller,
        });
        return jsonResponse(definition.response.parse(output));
      },
    };
  }

  private async resolveCaller(
    definition: AnyInterfaceRouteDefinition,
    request: Request,
    context: InterfacePluginContext,
  ): Promise<InterfaceCaller | null> {
    if (definition.security.kind === "public") return null;
    const actor = await definition.security.authenticate({ request });
    if (!actor?.id.trim()) return null;
    const permission: UserPermissionLevel = context.permissions.getUserLevel(
      this.definition.id,
      actor.id,
    );
    return Object.freeze({
      actor: Object.freeze({ ...actor }),
      permission,
      isAnchor: context.permissions.isAnchor(this.definition.id, actor.id),
    });
  }
}

export function createDeclarativeInterfacePlugin<
  TConfigSchema extends z.ZodType<object, object>,
  TAccountSettings extends AnyAccountSettingsDefinition | undefined,
>(
  definition: InterfaceDefinitionInput<TConfigSchema, TAccountSettings>,
  config: z.output<TConfigSchema>,
  metadata: InstalledPluginPackageMetadata,
  id: string,
): InterfacePlugin<z.output<TConfigSchema>, z.output<TConfigSchema>> {
  return new DeclarativeInterfacePlugin(definition, config, metadata, id);
}
