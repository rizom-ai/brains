import { describe, expect, test, beforeEach, mock } from "bun:test";
import { ServiceRegistry } from "../src/serviceRegistry";

import { createSilentLogger, type Logger } from "@brains/utils";

// Test component interface
interface TestComponent {
  id: string;
  getValue(): string;
}

// Test component implementation
class SimpleComponent implements TestComponent {
  public id: string;

  constructor(id: string) {
    this.id = id;
  }

  getValue(): string {
    return `Component ${this.id}`;
  }
}

// Test counter component interface
interface TestCounterComponent {
  increment(): number;
  getValue(): number;
}

describe("ServiceRegistry", (): void => {
  let serviceRegistry: ServiceRegistry;
  let logger: Logger;

  beforeEach((): void => {
    // Reset singletons
    ServiceRegistry.resetInstance();

    // Create fresh instances with mock logger
    logger = createSilentLogger();
    serviceRegistry = ServiceRegistry.createFresh(logger);
  });

  test("component lifecycle - register, resolve, and unregister", (): void => {
    // Mock factory function
    const componentFactory = mock(
      (...args: unknown[]) => new SimpleComponent(args[0] as string),
    );

    // Register component
    serviceRegistry.register("testComponent", componentFactory);
    expect(serviceRegistry.has("testComponent")).toBe(true);

    // Resolve component
    const component = serviceRegistry.resolve<TestComponent>(
      "testComponent",
      "test-1",
    );
    expect(component.id).toBe("test-1");
    expect(component.getValue()).toBe("Component test-1");
    expect(componentFactory).toHaveBeenCalledTimes(1);

    // Resolve again - should use cached instance
    const sameComponent = serviceRegistry.resolve<TestComponent>(
      "testComponent",
      "test-2",
    );
    expect(sameComponent).toBe(component);
    expect(componentFactory).toHaveBeenCalledTimes(1); // Factory not called again

    // Create fresh instance
    const freshComponent = serviceRegistry.createFresh<TestComponent>(
      "testComponent",
      "test-3",
    );
    expect(freshComponent).not.toBe(component);
    expect(freshComponent.id).toBe("test-3");
    expect(componentFactory).toHaveBeenCalledTimes(2);

    // Unregister component
    serviceRegistry.unregister("testComponent");
    expect(serviceRegistry.has("testComponent")).toBe(false);

    // Trying to resolve or create should throw
    expect(() => serviceRegistry.resolve("testComponent")).toThrow();
    expect(() => serviceRegistry.createFresh("testComponent")).toThrow();
  });

  test("registry maintains component state", (): void => {
    // Create a simple counter component
    let counter = 0;
    const counterFactory = (): {
      increment: () => number;
      getValue: () => number;
    } => ({
      increment: (): number => {
        counter++;
        return counter;
      },
      getValue: (): number => counter,
    });

    // Register and resolve the counter
    serviceRegistry.register("counter", counterFactory);
    const counterComponent = serviceRegistry.resolve<TestCounterComponent>("counter");

    // Use the component
    expect(counterComponent.increment()).toBe(1);
    expect(counterComponent.increment()).toBe(2);
    expect(counterComponent.getValue()).toBe(2);

    // Resolve again and it should maintain state
    const sameCounter = serviceRegistry.resolve<TestCounterComponent>("counter");
    expect(sameCounter.getValue()).toBe(2);
    expect(sameCounter.increment()).toBe(3);

    // Create fresh should not maintain state
    const freshCounter = serviceRegistry.createFresh<TestCounterComponent>("counter");
    expect(freshCounter.getValue()).toBe(3); // Still uses the same closure var

    // Clear registry and re-register
    serviceRegistry.clear();
    counter = 0; // Reset the counter
    serviceRegistry.register("counter", counterFactory);

    // State should be reset
    const newCounter = serviceRegistry.resolve<TestCounterComponent>("counter");
    expect(newCounter.getValue()).toBe(0);
  });
});
