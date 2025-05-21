import { describe, expect, test, beforeEach, mock } from "bun:test";
import { Registry } from "../../src/registry/registry";
import { Logger, LogLevel } from "../../src/utils/logger";

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

describe("Registry", (): void => {
  let registry: Registry;
  let logger: Logger;

  beforeEach((): void => {
    // Reset singletons
    Registry.resetInstance();
    Logger.resetInstance();

    // Create fresh instances
    logger = Logger.createFresh({ level: LogLevel.ERROR });
    registry = Registry.createFresh(logger);
  });

  test("component lifecycle - register, resolve, and unregister", (): void => {
    // Mock factory function
    const componentFactory = mock((id: string) => new SimpleComponent(id));

    // Register component
    registry.register("testComponent", componentFactory);
    expect(registry.has("testComponent")).toBe(true);

    // Resolve component
    const component = registry.resolve<TestComponent>(
      "testComponent",
      "test-1",
    );
    expect(component.id).toBe("test-1");
    expect(component.getValue()).toBe("Component test-1");
    expect(componentFactory).toHaveBeenCalledTimes(1);

    // Resolve again - should use cached instance
    const sameComponent = registry.resolve<TestComponent>(
      "testComponent",
      "test-2",
    );
    expect(sameComponent).toBe(component);
    expect(componentFactory).toHaveBeenCalledTimes(1); // Factory not called again

    // Create fresh instance
    const freshComponent = registry.createFresh<TestComponent>(
      "testComponent",
      "test-3",
    );
    expect(freshComponent).not.toBe(component);
    expect(freshComponent.id).toBe("test-3");
    expect(componentFactory).toHaveBeenCalledTimes(2);

    // Unregister component
    registry.unregister("testComponent");
    expect(registry.has("testComponent")).toBe(false);

    // Trying to resolve or create should throw
    expect(() => registry.resolve("testComponent")).toThrow();
    expect(() => registry.createFresh("testComponent")).toThrow();
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
    registry.register("counter", counterFactory);
    const counterComponent = registry.resolve("counter");

    // Use the component
    expect(counterComponent.increment()).toBe(1);
    expect(counterComponent.increment()).toBe(2);
    expect(counterComponent.getValue()).toBe(2);

    // Resolve again and it should maintain state
    const sameCounter = registry.resolve("counter");
    expect(sameCounter.getValue()).toBe(2);
    expect(sameCounter.increment()).toBe(3);

    // Create fresh should not maintain state
    const freshCounter = registry.createFresh("counter");
    expect(freshCounter.getValue()).toBe(3); // Still uses the same closure var

    // Clear registry and re-register
    registry.clear();
    counter = 0; // Reset the counter
    registry.register("counter", counterFactory);

    // State should be reset
    const newCounter = registry.resolve("counter");
    expect(newCounter.getValue()).toBe(0);
  });
});
