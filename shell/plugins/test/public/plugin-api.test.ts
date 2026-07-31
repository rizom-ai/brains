import { describe, expect, it } from "bun:test";
import { z } from "@brains/utils/zod";
import { createPluginHarness } from "../../src/test/harness";
import { createTool } from "../../src/public/types";
import { EntityPlugin } from "../../src/public/entity-plugin";
import { InterfacePlugin } from "../../src/public/interface-plugin";
import { MessageInterfacePlugin } from "../../src/public/message-interface-plugin";
import { ServicePlugin } from "../../src/public/service-plugin";
import type {
  EntityPluginContext,
  InterfacePluginContext,
  MessageInterfacePluginContext,
  ServicePluginContext,
  Tool,
} from "../../src/public/types";
import type { WebRouteDefinition } from "../../src/types/web-routes";
import {
  BaseEntityAdapter,
  baseEntitySchema,
  emptyFrontmatterSchema,
} from "@brains/entity-service";
import type { BaseEntity, EntityAdapter } from "@brains/entity-service";

const emptyConfig = z.object({});

/**
 * These cover the surface external plugin authors extend. Each public class
 * is a thin wrapper whose hooks have to reach a runtime delegate; nothing
 * else in the package exercises that wiring.
 */
describe("public plugin API", () => {
  it("runs a service plugin's hooks and publishes its tools", async () => {
    const seen: string[] = [];

    class TestService extends ServicePlugin<
      Record<string, never>,
      Record<string, never>
    > {
      constructor() {
        super(
          "test-service",
          { name: "test-service", version: "1.0.0" },
          {},
          emptyConfig,
        );
      }

      protected override async onRegister(
        context: ServicePluginContext,
      ): Promise<void> {
        seen.push(`register:${context.pluginId}`);
      }

      protected override async getTools(): Promise<Tool[]> {
        return [
          createTool(
            this.id,
            "ping",
            "Ping the test service",
            z.object({}),
            async () => ({ success: true, data: "pong" }),
          ),
        ];
      }

      protected override async getInstructions(): Promise<string> {
        return "test service instructions";
      }
    }

    const harness = createPluginHarness<TestService>();
    const capabilities = await harness.installPlugin(new TestService());

    expect(seen).toEqual(["register:test-service"]);
    expect(capabilities.tools.map((tool) => tool.name)).toContain(
      "test-service_ping",
    );
  });

  it("publishes an interface plugin's web routes and daemon requirement", async () => {
    const routes: WebRouteDefinition[] = [
      { path: "/test", handler: async () => new Response("ok") },
    ];

    class TestInterface extends InterfacePlugin<
      Record<string, never>,
      Record<string, never>
    > {
      public registered = false;

      constructor() {
        super(
          "test-interface",
          { name: "test-interface", version: "1.0.0" },
          {},
          emptyConfig,
        );
      }

      protected override async onRegister(
        _context: InterfacePluginContext,
      ): Promise<void> {
        this.registered = true;
      }

      override getWebRoutes(): WebRouteDefinition[] {
        return routes;
      }

      override requiresDaemonStartup(): boolean {
        return true;
      }
    }

    const plugin = new TestInterface();
    const harness = createPluginHarness<TestInterface>();
    await harness.installPlugin(plugin);

    expect(plugin.registered).toBe(true);
    expect(plugin.type).toBe("interface");
    // shell/core's plugin-routes reads these off the plugin object itself, so
    // the public wrapper — not the delegate — is what has to answer.
    expect(plugin.getWebRoutes()).toEqual(routes);
    expect(plugin.requiresDaemonStartup()).toBe(true);
  });

  it("gives a message interface its channel registry and message hooks", async () => {
    class TestMessageInterface extends MessageInterfacePlugin<
      Record<string, never>,
      Record<string, never>
    > {
      public canRegisterChannels = false;

      constructor() {
        super(
          "test-message-interface",
          { name: "test-message-interface", version: "1.0.0" },
          {},
          emptyConfig,
        );
      }

      protected override async onRegister(
        context: MessageInterfacePluginContext,
      ): Promise<void> {
        this.canRegisterChannels = "registerDescriptor" in context.channels;
      }

      protected override supportsMessageEditing(): boolean {
        return true;
      }
    }

    const plugin = new TestMessageInterface();
    const harness = createPluginHarness<TestMessageInterface>();
    await harness.installPlugin(plugin);

    // Only the message-interface context carries channel registration. Getting
    // the plain interface context back would mean the wrapper stood up the
    // wrong runtime delegate.
    expect(plugin.canRegisterChannels).toBe(true);
    expect(plugin.type).toBe("interface");

    // These forward to the delegate's progress machinery, which only the
    // message-interface runtime plugin has.
    plugin.startProcessingInput("channel-1");
    plugin.endProcessingInput();
    expect(plugin.getProgressEvents()).toEqual([]);
  });

  it("registers an entity plugin's type through its abstract members", async () => {
    type TestEntity = BaseEntity;

    class TestAdapter extends BaseEntityAdapter<TestEntity> {
      constructor() {
        super({
          entityType: "test-entity",
          purpose: "Entity used to exercise the public plugin API.",
          schema: baseEntitySchema,
          frontmatterSchema: emptyFrontmatterSchema,
        });
      }
      override toMarkdown(entity: TestEntity): string {
        return entity.content;
      }
      fromMarkdown(content: string): Partial<TestEntity> {
        return { content };
      }
    }

    class TestEntityPlugin extends EntityPlugin<
      TestEntity,
      Record<string, never>,
      Record<string, never>
    > {
      public readonly entityType = "test-entity";
      public readonly schema = baseEntitySchema;
      public readonly adapter: EntityAdapter<TestEntity> = new TestAdapter();

      constructor() {
        super(
          "test-entity-plugin",
          { name: "test-entity-plugin", version: "1.0.0" },
          {},
          emptyConfig,
        );
      }

      protected override async onRegister(
        _context: EntityPluginContext,
      ): Promise<void> {}
    }

    const plugin = new TestEntityPlugin();
    const harness = createPluginHarness<TestEntityPlugin>();
    await harness.installPlugin(plugin);

    expect(plugin.type).toBe("entity");
    expect(
      harness.getMockShell().getEntityRegistry().hasEntityType("test-entity"),
    ).toBe(true);
  });
});
