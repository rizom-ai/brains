import { AsyncLocalStorage } from "node:async_hooks";
import type { Caller } from "@brains/content-service";
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
} from "./interface-definition-contract";
import type { AnyServiceJobDefinition } from "../service/service-definition-contract";
import { getServiceJobRuntimeType } from "../service/job-definition-runtime";
import { emptyPluginState } from "../base/empty-state";
import { packageRuntimeState } from "../internal/state-namespace";
import { anonymousCaller } from "../service/job-authority";
import type { WebRouteDefinition } from "../types/web-routes";
import { createDeclaredRoute } from "../internal/declared-route";
import { createDeclarativeDaemon } from "./declarative-daemon";
import type { InterfacePluginContext } from "./context";
import { InterfacePlugin } from "./interface-plugin";

class DeclarativeInterfacePlugin<
  TConfigSchema extends z.ZodType<object, object>,
  TState extends object,
  TAccountSettings extends AnyAccountSettingsDefinition | undefined,
> extends InterfacePlugin<z.output<TConfigSchema>, z.output<TConfigSchema>> {
  private readonly definition: InterfaceDefinitionInput<
    TConfigSchema,
    TState,
    TAccountSettings
  >;
  private accountSettingsRegistration: AccountSettingsRegistration | undefined;
  private routes: WebRouteDefinition[] = [];
  private hasRequiredDaemon = false;
  private state: TState | undefined;
  /** What setup acquired, released last first at shutdown. */
  private readonly cleanups: Array<() => void | Promise<void>> = [];
  /** The caller of the route being handled; unset outside a route (daemons). */
  private readonly routeCaller = new AsyncLocalStorage<Caller>();

  constructor(
    definition: InterfaceDefinitionInput<
      TConfigSchema,
      TState,
      TAccountSettings
    >,
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
    this.state = this.definition.setup
      ? await this.definition.setup({
          config: this.config,
          lifecycle: {
            onCleanup: (cleanup): void => {
              this.cleanups.push(cleanup);
            },
          },
          runtimeState: packageRuntimeState(
            context.runtimeState,
            this.packageName,
          ),
        })
      : emptyPluginState<TState>();
    const state = this.state;
    const jobs = this.jobs(context);
    const routeDefinitions =
      this.definition.routes?.({ config: this.config, state, jobs }) ?? [];
    this.routes = routeDefinitions.map((route) =>
      this.runtimeRoute(route, context),
    );

    const daemonDefinitions =
      this.definition.daemons?.({ config: this.config, state, jobs }) ?? [];
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
    this.state = undefined;
    for (const cleanup of this.cleanups.splice(0).reverse()) {
      await cleanup();
    }
    await super.onShutdown();
  }

  private jobs(context: InterfacePluginContext): InterfaceJobs {
    return {
      enqueue: async <TDefinition extends AnyServiceJobDefinition>(
        definition: TDefinition,
        input: z.input<TDefinition["input"]>,
      ): Promise<{ readonly id: string }> => {
        const type = getServiceJobRuntimeType(definition);
        // Refused here, but queued as written: the worker parses it, once.
        definition.input.parse(input);
        // A route's caller starts the job; outside a route, this interface.
        const authority = await context.jobAuthority.admit(
          this.routeCaller.getStore(),
        );
        const id = await context.jobs.enqueue({
          type,
          data: { authority, input },
        });
        return Object.freeze({ id });
      },
    };
  }

  private runtimeRoute(
    definition: AnyInterfaceRouteDefinition,
    context: InterfacePluginContext,
  ): WebRouteDefinition {
    return createDeclaredRoute(definition, {
      declarationId: this.definition.id,
      permissions: context.permissions,
      anonymous: anonymousCaller(this.id),
      runAs: (caller, _request, run) => this.routeCaller.run(caller, run),
      logger: this.logger,
    });
  }
}

export function createDeclarativeInterfacePlugin<
  TConfigSchema extends z.ZodType<object, object>,
  TState extends object,
  TAccountSettings extends AnyAccountSettingsDefinition | undefined,
>(
  definition: InterfaceDefinitionInput<TConfigSchema, TState, TAccountSettings>,
  config: z.output<TConfigSchema>,
  metadata: InstalledPluginPackageMetadata,
  id: string,
): InterfacePlugin<z.output<TConfigSchema>, z.output<TConfigSchema>> {
  return new DeclarativeInterfacePlugin(definition, config, metadata, id);
}
