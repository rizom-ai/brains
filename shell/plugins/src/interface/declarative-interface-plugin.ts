import { AsyncLocalStorage } from "node:async_hooks";
import type { Caller } from "@brains/content-service";
import type { Logger } from "@brains/utils/logger";
import type { JobProgressEvent } from "@brains/job-queue";
import type { AnyAccountSettingsDefinition } from "../operator/account-settings-definition-contract";
import { createAccountDaemon } from "../operator/account-daemon-supervisor";
import type { AccountSettingsRegistration } from "../operator/account-settings-registry";
import type { z } from "@brains/utils/zod";
import {
  identityConfigSchema,
  type InstalledPluginPackageMetadata,
} from "../package-definition";
import type {
  AnyDeclaredRouteDefinition,
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
import {
  noFirstPartyDeclarations,
  type FirstPartyInterfaceDeclarations,
  type FirstPartySlotContext,
  type MessageTransport,
} from "./first-party-interface";
import {
  createInterfaceRuntime,
  withInterfaceRuntime,
  type InterfaceMessages,
} from "./interface-runtime";
import type { MessageInterfacePluginContext } from "./context";
import { MessageInterfacePlugin } from "../message-interface/message-interface-plugin";
import type { SendMessageToChannelRequest } from "../message-interface/progress-message-coordinator";

/** The plugin a declaration is registered as, as the declaration reads it. */
interface DeclarationOwner {
  readonly id: string;
  readonly packageName: string;
  logger(): Logger;
}

/**
 * What a generic interface declaration registers, whichever plugin carries
 * it: its account settings, setup and state, routes and daemons, and the
 * first-party declarations its wrappers added. A plain interface carries it
 * on the interface base; one with a message transport, on the message
 * interface base, whose coordination the transport sends through.
 */
class InterfaceDeclaration<
  TConfigSchema extends z.ZodType<object, object>,
  TState extends object,
  TAccountSettings extends AnyAccountSettingsDefinition | undefined,
> {
  private accountSettingsRegistration: AccountSettingsRegistration | undefined;
  private routes: WebRouteDefinition[] = [];
  private hasRequiredDaemon = false;
  private state: TState | undefined;
  /** What setup acquired, released last first at shutdown. */
  private readonly cleanups: Array<() => void | Promise<void>> = [];
  /** The caller of the route being handled; unset outside a route (daemons). */
  private readonly routeCaller = new AsyncLocalStorage<Caller>();
  /** What the runtime's message coordination sends through, once registered. */
  private transport: MessageTransport | undefined;

  private readonly definition: InterfaceDefinitionInput<
    TConfigSchema,
    TState,
    TAccountSettings
  >;
  private readonly declarations: FirstPartyInterfaceDeclarations;
  private readonly config: z.output<TConfigSchema>;
  private readonly owner: DeclarationOwner;

  constructor(
    definition: InterfaceDefinitionInput<
      TConfigSchema,
      TState,
      TAccountSettings
    >,
    declarations: FirstPartyInterfaceDeclarations,
    config: z.output<TConfigSchema>,
    owner: DeclarationOwner,
  ) {
    this.definition = definition;
    this.declarations = declarations;
    this.config = config;
    this.owner = owner;
  }

  async register(
    context: InterfacePluginContext,
    messages: InterfaceMessages | undefined,
  ): Promise<void> {
    if (this.definition.accountSettings) {
      this.accountSettingsRegistration = context.accountSettings.register({
        ownerPluginId: this.owner.id,
        packageName: this.owner.packageName,
        definitionId: this.definition.id,
        definition: this.definition.accountSettings,
      });
    }
    const runtime = createInterfaceRuntime({
      logger: this.owner.logger(),
      agent: context.agent,
      conversations: context.conversations,
      permissions: context.permissions,
      messages,
      interfaceId: this.definition.id,
    });
    this.state = this.definition.setup
      ? await this.definition.setup(
          withInterfaceRuntime(
            {
              config: this.config,
              lifecycle: {
                onCleanup: (cleanup): void => {
                  this.cleanups.push(cleanup);
                },
              },
              runtimeState: packageRuntimeState(
                context.runtimeState,
                this.owner.packageName,
              ),
            },
            runtime,
          ),
        )
      : emptyPluginState<TState>();
    const state = this.state;
    const jobs = this.jobs(context);
    const routeDefinitions =
      this.definition.routes?.(
        withInterfaceRuntime({ config: this.config, state, jobs }, runtime),
      ) ?? [];
    this.routes = routeDefinitions.map((route) =>
      this.runtimeRoute(route, context),
    );

    const daemonIds = new Set<string>();
    const claimDaemonId = (id: string): void => {
      if (daemonIds.has(id)) {
        throw new Error(
          `Interface "${this.definition.id}" defines daemon "${id}" more than once`,
        );
      }
      daemonIds.add(id);
    };
    const daemonDefinitions =
      this.definition.daemons?.(
        withInterfaceRuntime({ config: this.config, state, jobs }, runtime),
      ) ?? [];
    for (const daemon of daemonDefinitions) {
      claimDaemonId(daemon.id);
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

    const slotContext = (): FirstPartySlotContext<unknown, unknown> =>
      withInterfaceRuntime({ config: this.config, state }, runtime);
    for (const slot of this.declarations.daemons) {
      const daemon = slot.run(slotContext());
      claimDaemonId(daemon.id);
      // As the class's daemon was: started and stopped by the brain, its
      // health its own, with no readiness to wait for.
      context.daemons.register(daemon.id, daemon);
    }
    this.transport = this.declarations.transport?.run(slotContext());
  }

  async registrationComplete(context: InterfacePluginContext): Promise<void> {
    if (
      this.accountSettingsRegistration &&
      !context.accountSettings.hasBackend()
    ) {
      throw new Error(
        `Interface "${this.definition.id}" account settings require auth-service and an account settings encryption key`,
      );
    }
  }

  webRoutes(): WebRouteDefinition[] {
    return [...this.routes];
  }

  requiresDaemonStartup(): boolean {
    return this.hasRequiredDaemon;
  }

  /** Sends a coordinated message, once the transport is registered. */
  send(request: SendMessageToChannelRequest): void {
    this.transport?.send({
      channelId: request.channelId,
      message: request.message,
    });
  }

  async shutdown(): Promise<void> {
    this.accountSettingsRegistration = undefined;
    this.routes = [];
    this.hasRequiredDaemon = false;
    this.state = undefined;
    this.transport = undefined;
    for (const cleanup of this.cleanups.splice(0).reverse()) {
      await cleanup();
    }
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
    definition: AnyDeclaredRouteDefinition,
    context: InterfacePluginContext,
  ): WebRouteDefinition {
    return createDeclaredRoute(definition, {
      declarationId: this.definition.id,
      permissions: context.permissions,
      anonymous: anonymousCaller(this.owner.id),
      runAs: (caller, _request, run) => this.routeCaller.run(caller, run),
      logger: this.owner.logger(),
    });
  }
}

class DeclarativeInterfacePlugin<
  TConfigSchema extends z.ZodType<object, object>,
  TState extends object,
  TAccountSettings extends AnyAccountSettingsDefinition | undefined,
> extends InterfacePlugin<z.output<TConfigSchema>, z.output<TConfigSchema>> {
  private readonly declaration: InterfaceDeclaration<
    TConfigSchema,
    TState,
    TAccountSettings
  >;

  constructor(
    definition: InterfaceDefinitionInput<
      TConfigSchema,
      TState,
      TAccountSettings
    >,
    declarations: FirstPartyInterfaceDeclarations,
    config: z.output<TConfigSchema>,
    metadata: InstalledPluginPackageMetadata,
    id: string,
  ) {
    super(id, metadata, config, identityConfigSchema());
    this.declaration = new InterfaceDeclaration(
      definition,
      declarations,
      config,
      { id, packageName: this.packageName, logger: (): Logger => this.logger },
    );
  }

  protected override async onRegister(
    context: InterfacePluginContext,
  ): Promise<void> {
    await super.onRegister(context);
    await this.declaration.register(context, undefined);
  }

  protected override async onRegistrationComplete(
    context: InterfacePluginContext,
  ): Promise<void> {
    await this.declaration.registrationComplete(context);
  }

  override getWebRoutes(): WebRouteDefinition[] {
    return this.declaration.webRoutes();
  }

  override requiresDaemonStartup(): boolean {
    return this.declaration.requiresDaemonStartup();
  }

  protected override async onShutdown(): Promise<void> {
    await this.declaration.shutdown();
    await super.onShutdown();
  }
}

/**
 * A generic interface declared with a message transport: the message
 * interface base's coordination (job progress, completions held back while
 * input is answered) runs for it and sends through its transport, as its
 * class extended that base.
 */
class DeclarativeTransportInterfacePlugin<
  TConfigSchema extends z.ZodType<object, object>,
  TState extends object,
  TAccountSettings extends AnyAccountSettingsDefinition | undefined,
> extends MessageInterfacePlugin<
  z.output<TConfigSchema>,
  z.output<TConfigSchema>
> {
  private readonly declaration: InterfaceDeclaration<
    TConfigSchema,
    TState,
    TAccountSettings
  >;

  constructor(
    definition: InterfaceDefinitionInput<
      TConfigSchema,
      TState,
      TAccountSettings
    >,
    declarations: FirstPartyInterfaceDeclarations,
    config: z.output<TConfigSchema>,
    metadata: InstalledPluginPackageMetadata,
    id: string,
  ) {
    super(id, metadata, config, identityConfigSchema());
    this.declaration = new InterfaceDeclaration(
      definition,
      declarations,
      config,
      { id, packageName: this.packageName, logger: (): Logger => this.logger },
    );
  }

  protected override async onRegister(
    context: MessageInterfacePluginContext,
  ): Promise<void> {
    await super.onRegister(context);
    await this.declaration.register(context, this.messages());
  }

  protected override async onRegistrationComplete(
    context: MessageInterfacePluginContext,
  ): Promise<void> {
    await this.declaration.registrationComplete(context);
  }

  override getWebRoutes(): WebRouteDefinition[] {
    return this.declaration.webRoutes();
  }

  override requiresDaemonStartup(): boolean {
    return this.declaration.requiresDaemonStartup();
  }

  protected override sendMessageToChannel(
    request: SendMessageToChannelRequest,
  ): void {
    this.declaration.send(request);
  }

  protected override async onShutdown(): Promise<void> {
    await this.declaration.shutdown();
    await super.onShutdown();
  }

  private messages(): InterfaceMessages {
    return Object.freeze({
      startProcessingInput: (channelId?: string | null): void => {
        this.startProcessingInput(channelId);
      },
      endProcessingInput: (): void => {
        this.endProcessingInput();
      },
      registerProgressCallback: (
        callback: (events: JobProgressEvent[]) => void,
      ): void => {
        this.registerProgressCallback(callback);
      },
      unregisterProgressCallback: (): void => {
        this.unregisterProgressCallback();
      },
      hasProgressCallback: (): boolean => this.hasProgressCallback(),
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
  declarations: FirstPartyInterfaceDeclarations = noFirstPartyDeclarations,
): InterfacePlugin<z.output<TConfigSchema>, z.output<TConfigSchema>> {
  return declarations.transport
    ? new DeclarativeTransportInterfacePlugin(
        definition,
        declarations,
        config,
        metadata,
        id,
      )
    : new DeclarativeInterfacePlugin(
        definition,
        declarations,
        config,
        metadata,
        id,
      );
}
