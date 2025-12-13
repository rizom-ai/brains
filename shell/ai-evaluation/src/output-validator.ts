import type { ExpectedOutput, FailureDetail } from "./schemas";

/**
 * Validates plugin outputs against expected output schemas
 */
export class OutputValidator {
  /**
   * Validate an output against expected output criteria
   */
  validate(output: unknown, expected: ExpectedOutput): FailureDetail[] {
    const failures: FailureDetail[] = [];

    // Handle array outputs
    if (Array.isArray(output)) {
      failures.push(...this.validateArray(output, expected));
    } else if (expected.minItems || expected.maxItems || expected.exactItems) {
      // Expected array but got something else
      failures.push({
        criterion: "outputType",
        expected: "array",
        actual: typeof output,
        message: `Expected array output but got ${typeof output}`,
      });
    }

    return failures;
  }

  /**
   * Validate array output
   */
  private validateArray(
    output: unknown[],
    expected: ExpectedOutput,
  ): FailureDetail[] {
    const failures: FailureDetail[] = [];

    // Check exact count
    if (
      expected.exactItems !== undefined &&
      output.length !== expected.exactItems
    ) {
      failures.push({
        criterion: "exactItems",
        expected: expected.exactItems,
        actual: output.length,
        message: `Expected exactly ${expected.exactItems} items, got ${output.length}`,
      });
    }

    // Check min count
    if (expected.minItems !== undefined && output.length < expected.minItems) {
      failures.push({
        criterion: "minItems",
        expected: `>= ${expected.minItems}`,
        actual: output.length,
        message: `Expected at least ${expected.minItems} items, got ${output.length}`,
      });
    }

    // Check max count
    if (expected.maxItems !== undefined && output.length > expected.maxItems) {
      failures.push({
        criterion: "maxItems",
        expected: `<= ${expected.maxItems}`,
        actual: output.length,
        message: `Expected at most ${expected.maxItems} items, got ${output.length}`,
      });
    }

    // Check itemsContain - verify at least one item matches each pattern
    if (expected.itemsContain) {
      for (const check of expected.itemsContain) {
        const pattern = new RegExp(check.pattern);
        const hasMatch = output.some((item) => {
          const value = this.getFieldValue(item, check.field);
          return typeof value === "string" && pattern.test(value);
        });

        if (!hasMatch) {
          failures.push({
            criterion: "itemsContain",
            expected: `item.${check.field} matches /${check.pattern}/`,
            actual: "no matching item found",
            message: `No item found where ${check.field} matches pattern /${check.pattern}/`,
          });
        }
      }
    }

    // Check validateEach - validate each item against path checks
    if (expected.validateEach) {
      for (const check of expected.validateEach) {
        for (let i = 0; i < output.length; i++) {
          const item = output[i];
          const value = this.getPathValue(item, check.path);

          // Check exists
          if (check.exists !== undefined) {
            const exists = value !== undefined;
            if (exists !== check.exists) {
              failures.push({
                criterion: "validateEach.exists",
                expected: check.exists ? "exists" : "does not exist",
                actual: exists ? "exists" : "does not exist",
                message: `Item[${i}].${check.path}: expected ${check.exists ? "to exist" : "not to exist"}`,
              });
            }
          }

          // Check equals
          if (check.equals !== undefined && value !== check.equals) {
            failures.push({
              criterion: "validateEach.equals",
              expected: JSON.stringify(check.equals),
              actual: JSON.stringify(value),
              message: `Item[${i}].${check.path}: expected ${JSON.stringify(check.equals)}, got ${JSON.stringify(value)}`,
            });
          }

          // Check matches (regex)
          if (check.matches !== undefined) {
            const pattern = new RegExp(check.matches);
            if (typeof value !== "string" || !pattern.test(value)) {
              failures.push({
                criterion: "validateEach.matches",
                expected: `matches /${check.matches}/`,
                actual: typeof value === "string" ? value : typeof value,
                message: `Item[${i}].${check.path}: expected to match /${check.matches}/`,
              });
            }
          }
        }
      }
    }

    return failures;
  }

  /**
   * Get a field value from an object (simple dot notation)
   */
  private getFieldValue(obj: unknown, field: string): unknown {
    if (obj === null || typeof obj !== "object") {
      return undefined;
    }
    return (obj as Record<string, unknown>)[field];
  }

  /**
   * Get a value at a path (supports dot notation and array indices)
   * Example paths: "name", "sources[0].type", "metadata.score"
   */
  private getPathValue(obj: unknown, path: string): unknown {
    const parts = path.split(/[.[\]]/).filter(Boolean);
    let current: unknown = obj;

    for (const part of parts) {
      if (current === null || current === undefined) {
        return undefined;
      }

      if (typeof current !== "object") {
        return undefined;
      }

      // Check if it's an array index
      const index = parseInt(part, 10);
      if (!isNaN(index) && Array.isArray(current)) {
        current = current[index];
      } else {
        current = (current as Record<string, unknown>)[part];
      }
    }

    return current;
  }

  /**
   * Create a fresh instance
   */
  static createFresh(): OutputValidator {
    return new OutputValidator();
  }
}
