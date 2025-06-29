import type { BaseEntity } from "@brains/types";
import type { PluginTool, Plugin } from "@brains/plugin-utils";

/**
 * Custom assertions for plugin testing
 */
export class PluginAssertions {
  /**
   * Assert entity has required base fields
   */
  static assertValidEntity(entity: unknown): asserts entity is BaseEntity {
    if (!entity || typeof entity !== "object") {
      throw new Error("Entity must be an object");
    }

    const e = entity as Record<string, unknown>;

    if (!e["id"] || typeof e["id"] !== "string") {
      throw new Error("Entity must have string id");
    }

    if (!e["entityType"] || typeof e["entityType"] !== "string") {
      throw new Error("Entity must have string entityType");
    }

    if (
      !e["created"] ||
      !(e["created"] instanceof Date || typeof e["created"] === "string")
    ) {
      throw new Error("Entity must have created date");
    }

    if (
      !e["updated"] ||
      !(e["updated"] instanceof Date || typeof e["updated"] === "string")
    ) {
      throw new Error("Entity must have updated date");
    }
  }

  /**
   * Assert entities match expected data
   */
  static assertEntitiesMatch(
    actual: BaseEntity[],
    expected: Array<Partial<BaseEntity>>,
    options: {
      ignoreFields?: string[];
      orderMatters?: boolean;
    } = {},
  ): void {
    const {
      ignoreFields = ["id", "created", "updated"],
      orderMatters = false,
    } = options;

    if (actual.length !== expected.length) {
      throw new Error(
        `Entity count mismatch. Expected ${expected.length}, got ${actual.length}`,
      );
    }

    const actualToCompare = actual.map((e) => this.omitFields(e, ignoreFields));
    const expectedToCompare = expected.map((e) =>
      this.omitFields(e, ignoreFields),
    );

    if (!orderMatters) {
      // Sort by a stable field for comparison
      // First try to sort by a common field like title or content
      const getSortKey = (item: Partial<BaseEntity>): string => {
        if ("title" in item && typeof item.title === "string")
          return item.title;
        if ("content" in item && typeof item.content === "string")
          return item.content;
        if ("id" in item && typeof item.id === "string") return item.id;
        return JSON.stringify(item);
      };

      actualToCompare.sort((a, b) =>
        getSortKey(a).localeCompare(getSortKey(b)),
      );
      expectedToCompare.sort((a, b) =>
        getSortKey(a).localeCompare(getSortKey(b)),
      );
    }

    for (let i = 0; i < actualToCompare.length; i++) {
      const actualItem = actualToCompare[i];
      const expectedItem = expectedToCompare[i];

      for (const [key, value] of Object.entries(expectedItem ?? {})) {
        const actualValue = actualItem
          ? (actualItem as Record<string, unknown>)[key]
          : undefined;
        if (actualValue !== value) {
          throw new Error(
            `Entity mismatch at index ${i}, field ${key}. Expected ${value}, got ${actualValue}`,
          );
        }
      }
    }
  }

  /**
   * Assert tool has required properties
   */
  static assertValidTool(tool: unknown): asserts tool is PluginTool {
    if (!tool || typeof tool !== "object") {
      throw new Error("Tool must be an object");
    }

    const t = tool as Record<string, unknown>;

    if (!t["name"] || typeof t["name"] !== "string") {
      throw new Error("Tool must have string name");
    }

    if (typeof t["handler"] !== "function") {
      throw new Error("Tool must have handler function");
    }
  }

  /**
   * Assert plugin has required properties
   */
  static assertValidPlugin(plugin: unknown): asserts plugin is Plugin {
    if (!plugin || typeof plugin !== "object") {
      throw new Error("Plugin must be an object");
    }

    const p = plugin as Record<string, unknown>;

    if (!p["id"] || typeof p["id"] !== "string") {
      throw new Error("Plugin must have string id");
    }

    if (!p["name"] || typeof p["name"] !== "string") {
      throw new Error("Plugin must have string name");
    }

    if (!p["version"] || typeof p["version"] !== "string") {
      throw new Error("Plugin must have string version");
    }

    if (typeof p["register"] !== "function") {
      throw new Error("Plugin must have register function");
    }
  }

  /**
   * Assert async operation completes within timeout
   */
  static async assertCompletesWithin<T>(
    operation: () => Promise<T>,
    timeout: number,
    message?: string,
  ): Promise<T> {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(
        () =>
          reject(
            new Error(message ?? `Operation timed out after ${timeout}ms`),
          ),
        timeout,
      );
    });

    return Promise.race([operation(), timeoutPromise]);
  }

  /**
   * Assert async operation throws
   */
  static async assertThrows(
    operation: () => Promise<unknown>,
    expectedError?: string | RegExp | typeof Error,
  ): Promise<void> {
    let operationThrew = false;
    let caughtError: unknown;

    try {
      await operation();
    } catch (error) {
      operationThrew = true;
      caughtError = error;
    }

    if (!operationThrew) {
      throw new Error("Expected operation to throw but it succeeded");
    }

    // If we have an expected error pattern, validate it
    if (expectedError) {
      if (typeof expectedError === "string") {
        if (
          !(caughtError instanceof Error) ||
          !caughtError.message.includes(expectedError)
        ) {
          throw new Error(
            `Expected error message to include "${expectedError}" but got "${caughtError}"`,
          );
        }
      } else if (expectedError instanceof RegExp) {
        if (
          !(caughtError instanceof Error) ||
          !expectedError.test(caughtError.message)
        ) {
          throw new Error(
            `Expected error message to match ${expectedError} but got "${caughtError}"`,
          );
        }
      } else if (typeof expectedError === "function") {
        if (!(caughtError instanceof expectedError)) {
          throw new Error(
            `Expected error to be instance of ${expectedError.name} but got ${caughtError}`,
          );
        }
      }
    }
  }

  /**
   * Helper to omit fields from object
   */
  private static omitFields<T extends Record<string, unknown>>(
    obj: T,
    fields: string[],
  ): Partial<T> {
    const result = { ...obj };
    for (const field of fields) {
      delete result[field];
    }
    return result;
  }
}
