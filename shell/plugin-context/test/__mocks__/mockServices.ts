import { mock } from "bun:test";
import { createSilentLogger } from "@brains/utils";
import type { CoreServices } from "../../src/contexts/corePluginContext";

export function createMockCoreServices(): CoreServices {
  // Store registered templates and subscriptions for testing
  const templates = new Map<string, any>();
  const subscriptions = new Map<string, any[]>();

  return {
    logger: createSilentLogger(),
    messageBus: {
      send: mock(() => Promise.resolve({ success: true, results: [] })),
      subscribe: mock((channel: string, handler: any) => {
        if (!subscriptions.has(channel)) {
          subscriptions.set(channel, []);
        }
        subscriptions.get(channel)!.push(handler);
        return () => {
          const handlers = subscriptions.get(channel);
          if (handlers) {
            const index = handlers.indexOf(handler);
            if (index > -1) handlers.splice(index, 1);
          }
        };
      }),
      unsubscribe: mock(() => {}),
    },
    contentGenerator: {
      generateContent: mock(() => Promise.resolve({})),
      formatContent: mock((templateName: string, data: any) => {
        // Just use the template directly - no scoping needed at this level
        const template = templates.get(templateName);
        if (template && template.generate) {
          // Run the template synchronously for testing
          return template.generate(data);
        }
        return "formatted content";
      }),
      parseContent: mock(() => ({})),
      registerTemplate: mock((name: string, template: any) => {
        templates.set(name, template);
      }),
      getTemplate: mock((name: string) => templates.get(name) || null),
      listTemplates: mock(() => Array.from(templates.values())),
      generateWithRoute: mock(() => Promise.resolve("generated")),
    },
  };
}
