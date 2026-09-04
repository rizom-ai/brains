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
  InterfaceDefinitionInput,
  InterfaceJobs,
  InterfaceJobStatus,
} from "./interface-definition-contract";
import type { AnyServiceJobDefinition } from "../service/service-definition-contract";
import { getServiceJobRuntimeType } from "../service/job-definition-runtime";
import type { WebRouteDefinition } from "../types/web-routes";
import type { Tool } from "@brains/mcp-service";
import type { EntityReactionContext } from "../entity/entity-definition-contract";
import {
  createReactionContext,
  type ReactionContextSource,
} from "../service/reaction-context";
import { createRuntimeTool } from "../service/tool-runtime";
import { createInterfaceEntityAccess } from "./interface-entity-access";
import { uploadNamespaceFor } from "../internal/state-namespace";
import { createDeclarativeDaemon } from "./declarative-daemon";
import { createRuntimeRoute } from "./route-runtime";
import type { InterfacePluginContext } from "./context";
import { InterfacePlugin } from "./interface-plugin";

class DeclarativeInterfacePlugin<
  TConfigSchema extends z.ZodType<object, object>,
  TAccountSettings extends AnyAccountSettingsDefinition | undefined,
  TState extends object,
> extends InterfacePlugin<z.output<TConfigSchema>, z.output<TConfigSchema>> {
  private readonly definition: InterfaceDefinitionInput<
    TConfigSchema,
    TAccountSettings,
    TState
  >;
  private accountSettingsRegistration: AccountSettingsRegistration | undefined;
  private routes: WebRouteDefinition[] = [];
  private hasRequiredDaemon = false;
  private state: TState | undefined;
  private reactionSource: ReactionContextSource | undefined;

  constructor(
    definition: InterfaceDefinitionInput<
      TConfigSchema,
      TAccountSettings,
      TState
    >,
    config: z.output<TConfigSchema>,
    metadata: InstalledPluginPackageMetadata,
    id: string,
  ) {
    super(id, metadata, config, identityConfigSchema());
    this.definition = definition;
  }

  /**
   * What setup returned. Read after registration, so a declaration that
   * builds nothing still typechecks as having built something empty.
   */
  private requireState(): TState {
    if (this.state === undefined) {
      throw new Error(
        `Interface "${this.definition.id}" read its state before setup ran`,
      );
    }
    return this.state;
  }

  protected override async onRegister(
    context: InterfacePluginContext,
  ): Promise<void> {
    await super.onRegister(context);
    this.reactionSource = context;
    if (this.definition.accountSettings) {
      this.accountSettingsRegistration = context.accountSettings.register({
        ownerPluginId: this.id,
        packageName: this.packageName,
        definitionId: this.definition.id,
        definition: this.definition.accountSettings,
      });
    }
    // Before anything else it registers: setup is where an interface refuses
    // to start, and a refusal after half its surfaces are mounted is worse
    // than one before any of them.
    this.state = this.definition.setup
      ? this.definition.setup({
          config: this.config,
          plugins: context.plugins,
          endpoints: context.endpoints,
          interactions: context.interactions,
          auth: context.auth,
          mcpTransport: context.mcpTransport,
          permissions: context.permissions,
          agent: context.agent,
          conversations: context.conversations,
          entities: createInterfaceEntityAccess(
            context.entityService,
            this.definition.id,
          ),
          runtimeState: (options) =>
            context.runtimeState.scoped({
              ...options,
              namespace: `${this.definition.id}.${options.namespace}`,
            }),
          uploads: (options) =>
            context.uploads.scoped({
              ...options,
              namespace: uploadNamespaceFor(
                this.definition.id,
                options.namespace,
              ),
            }),
          domain: context.domain,
          logger: this.logger,
        })
      : (Object.freeze({}) as TState);
    const jobs = this.jobs(context);
    const routeDefinitions =
      this.definition.routes?.({
        config: this.config,
        state: this.requireState(),
        jobs,
      }) ?? [];
    this.routes = routeDefinitions.map((route) =>
      this.runtimeRoute(route, context),
    );

    const daemonDefinitions =
      this.definition.daemons?.({
        config: this.config,
        state: this.requireState(),
        jobs,
      }) ?? [];
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

  private reaction(): EntityReactionContext {
    const context = this.reactionSource;
    if (!context) {
      throw new Error(
        `Interface "${this.definition.id}" ran a tool before registration`,
      );
    }
    return createReactionContext({
      context,
      packageName: this.packageName,
      // Reads only, and no types owned: an interface stores nothing, and a
      // tool of its own that wanted to would be a service.
      entities: createInterfaceEntityAccess(
        context.entityService,
        this.definition.id,
      ),
      logger: this.logger,
    });
  }

  protected override async getTools(): Promise<Tool[]> {
    const definitions =
      this.definition.tools?.({
        config: this.config,
        state: this.requireState(),
      }) ?? [];
    const names = new Set<string>();
    return definitions.map((definition) => {
      if (names.has(definition.name)) {
        throw new Error(
          `Interface "${this.definition.id}" defines tool "${definition.name}" more than once`,
        );
      }
      names.add(definition.name);
      return createRuntimeTool({
        definition,
        pluginId: this.definition.id,
        // An interface owns no entity types, so its tools get the reads a
        // reaction offers over nothing: the shape is the same, and what it
        // reaches is empty on purpose.
        reaction: () => this.reaction(),
        // An interface is a way in, so a tool it declares may be the
        // conversation itself. The gate is on the tool: only one the agent
        // cannot call gets to call the agent.
        agent: () => this.context?.agent,
      });
    });
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
      getStatus: async (jobId): Promise<InterfaceJobStatus | null> => {
        const job = await context.jobs.getStatus(jobId);
        return job
          ? Object.freeze({
              id: job.id,
              status: job.status,
              lastError: job.lastError ?? null,
            })
          : null;
      },
    };
  }

  private runtimeRoute(
    definition: AnyInterfaceRouteDefinition,
    context: InterfacePluginContext,
  ): WebRouteDefinition {
    return createRuntimeRoute(definition, {
      declarationId: this.definition.id,
      permissions: context.permissions,
    });
  }
}

export function createDeclarativeInterfacePlugin<
  TConfigSchema extends z.ZodType<object, object>,
  TAccountSettings extends AnyAccountSettingsDefinition | undefined,
  TState extends object,
>(
  definition: InterfaceDefinitionInput<TConfigSchema, TAccountSettings, TState>,
  config: z.output<TConfigSchema>,
  metadata: InstalledPluginPackageMetadata,
  id: string,
): InterfacePlugin<z.output<TConfigSchema>, z.output<TConfigSchema>> {
  return new DeclarativeInterfacePlugin(definition, config, metadata, id);
}
