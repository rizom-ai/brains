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
    } else if (typeof output === "object" && output !== null) {
      // Handle object outputs
      failures.push(...this.validateObject(output, expected));
    }

    return failures;
  }

  /**
   * Validate object output using validateEach on the object itself
   */
  private validateObject(
    output: object,
    expected: ExpectedOutput,
  ): FailureDetail[] {
    const failures: FailureDetail[] = [];

    // Check validateEach - validate paths against the object
    if (expected.validateEach) {
      for (const check of expected.validateEach) {
        const value = this.getPathValue(output, check.path);

        // Check exists
        if (check.exists !== undefined) {
          const exists = value !== undefined;
          if (exists !== check.exists) {
            failures.push({
              criterion: "validateEach.exists",
              expected: check.exists ? "exists" : "does not exist",
              actual: exists ? "exists" : "does not exist",
              message: `${check.path}: expected ${check.exists ? "to exist" : "not to exist"}`,
            });
          }
        }

        // Check equals
        if (check.equals !== undefined && value !== check.equals) {
          failures.push({
            criterion: "validateEach.equals",
            expected: JSON.stringify(check.equals),
            actual: JSON.stringify(value),
            message: `${check.path}: expected ${JSON.stringify(check.equals)}, got ${JSON.stringify(value)}`,
          });
        }

        // Check matches (regex)
        if (check.matches !== undefined) {
          const pattern = new RegExp(check.matches);
          if (typeof value !== "string" || !pattern.test(value)) {
            failures.push({
              criterion: "validateEach.matches",
              expected: `matches /${check.matches}/`,
              actual:
                typeof value === "string"
                  ? `"${value.slice(0, 100)}..."`
                  : typeof value,
              message: `${check.path}: expected to match /${check.matches}/`,
            });
          }
        }
      }
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
        const { pattern, description } = this.buildPattern(check);
        const hasMatch = output.some((item) => {
          const value = this.getFieldValue(item, check.field);
          return typeof value === "string" && pattern.test(value);
        });

        if (!hasMatch) {
          failures.push({
            criterion: "itemsContain",
            expected: `item.${check.field} matches ${description}`,
            actual: "no matching item found",
            message: `No item found where ${check.field} matches ${description}`,
          });
        }
      }
    }

    // Check itemsNotContain - verify NO item matches the patterns
    if (expected.itemsNotContain) {
      for (const check of expected.itemsNotContain) {
        const { pattern, description } = this.buildPattern(check);
        const matchingItems: { index: number; value: string }[] = [];

        output.forEach((item, index) => {
          const value = this.getFieldValue(item, check.field);
          if (typeof value === "string" && pattern.test(value)) {
            matchingItems.push({ index, value });
          }
        });

        if (matchingItems.length > 0) {
          const examples = matchingItems
            .slice(0, 3)
            .map((m) => `[${m.index}]: "${m.value}"`)
            .join(", ");
          failures.push({
            criterion: "itemsNotContain",
            expected: `no item.${check.field} matches ${description}`,
            actual: `${matchingItems.length} item(s) matched: ${examples}`,
            message: `Found ${matchingItems.length} item(s) where ${check.field} matches forbidden ${description}`,
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
   * Build a regex pattern from either pattern string or words array
   * Words automatically get word boundaries applied
   */
  private buildPattern(check: {
    pattern?: string | undefined;
    words?: string[] | undefined;
  }): { pattern: RegExp; description: string } {
    if (check.pattern) {
      return {
        pattern: new RegExp(check.pattern),
        description: `/${check.pattern}/`,
      };
    }

    if (check.words && check.words.length > 0) {
      // Escape special regex characters in words and join with OR
      const escaped = check.words.map((w) =>
        w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
      );
      const regexStr = `\\b(${escaped.join("|")})\\b`;
      return {
        pattern: new RegExp(regexStr, "i"),
        description: `words [${check.words.join(", ")}]`,
      };
    }

    // Fallback (should not happen due to schema validation)
    return {
      pattern: new RegExp("(?!)"), // Never matches
      description: "empty pattern",
    };
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
