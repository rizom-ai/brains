import type {
  ExpectedOutput,
  FailureDetail,
  ItemsContain,
  PathValidation,
} from "./schemas";

interface PatternMatch {
  pattern: RegExp;
  description: string;
}

interface PathValidationContext {
  criterionPrefix: string;
  messagePrefix: string;
  formatActualString: (value: string) => string;
}

/**
 * Validates plugin outputs against expected output schemas
 */
export class OutputValidator {
  /**
   * Validate an output against expected output criteria
   */
  validate(output: unknown, expected: ExpectedOutput): FailureDetail[] {
    if (Array.isArray(output)) {
      return this.validateArray(output, expected);
    }

    if (this.expectsArray(expected)) {
      return [
        {
          criterion: "outputType",
          expected: "array",
          actual: typeof output,
          message: `Expected array output but got ${typeof output}`,
        },
      ];
    }

    if (typeof output === "object" && output !== null) {
      return this.validateObject(output, expected);
    }

    return [];
  }

  /**
   * Validate object output using validateEach on the object itself
   */
  private validateObject(
    output: object,
    expected: ExpectedOutput,
  ): FailureDetail[] {
    return this.validatePathChecks(output, expected.validateEach ?? [], {
      criterionPrefix: "validateEach",
      messagePrefix: "",
      formatActualString: (value) => `"${value.slice(0, 100)}..."`,
    });
  }

  /**
   * Validate array output
   */
  private validateArray(
    output: unknown[],
    expected: ExpectedOutput,
  ): FailureDetail[] {
    return [
      ...this.validateArrayCounts(output, expected),
      ...this.validateItemsContain(output, expected.itemsContain ?? []),
      ...this.validateItemsNotContain(output, expected.itemsNotContain ?? []),
      ...this.validateArrayItems(output, expected.validateEach ?? []),
    ];
  }

  private expectsArray(expected: ExpectedOutput): boolean {
    return [expected.minItems, expected.maxItems, expected.exactItems].some(
      Boolean,
    );
  }

  private validateArrayCounts(
    output: unknown[],
    expected: ExpectedOutput,
  ): FailureDetail[] {
    const failures: FailureDetail[] = [];

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

    if (expected.minItems !== undefined && output.length < expected.minItems) {
      failures.push({
        criterion: "minItems",
        expected: `>= ${expected.minItems}`,
        actual: output.length,
        message: `Expected at least ${expected.minItems} items, got ${output.length}`,
      });
    }

    if (expected.maxItems !== undefined && output.length > expected.maxItems) {
      failures.push({
        criterion: "maxItems",
        expected: `<= ${expected.maxItems}`,
        actual: output.length,
        message: `Expected at most ${expected.maxItems} items, got ${output.length}`,
      });
    }

    return failures;
  }

  private validateItemsContain(
    output: unknown[],
    checks: ItemsContain[],
  ): FailureDetail[] {
    const failures: FailureDetail[] = [];

    for (const check of checks) {
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

    return failures;
  }

  private validateItemsNotContain(
    output: unknown[],
    checks: ItemsContain[],
  ): FailureDetail[] {
    const failures: FailureDetail[] = [];

    for (const check of checks) {
      const { pattern, description } = this.buildPattern(check);
      const matchingItems = this.findMatchingItems(output, check, pattern);

      if (matchingItems.length > 0) {
        const examples = matchingItems
          .slice(0, 3)
          .map((match) => `[${match.index}]: "${match.value}"`)
          .join(", ");
        failures.push({
          criterion: "itemsNotContain",
          expected: `no item.${check.field} matches ${description}`,
          actual: `${matchingItems.length} item(s) matched: ${examples}`,
          message: `Found ${matchingItems.length} item(s) where ${check.field} matches forbidden ${description}`,
        });
      }
    }

    return failures;
  }

  private validateArrayItems(
    output: unknown[],
    checks: PathValidation[],
  ): FailureDetail[] {
    const failures: FailureDetail[] = [];

    output.forEach((item, index) => {
      failures.push(
        ...this.validatePathChecks(item, checks, {
          criterionPrefix: "validateEach",
          messagePrefix: `Item[${index}].`,
          formatActualString: (value) => value,
        }),
      );
    });

    return failures;
  }

  private validatePathChecks(
    target: unknown,
    checks: PathValidation[],
    context: PathValidationContext,
  ): FailureDetail[] {
    const failures: FailureDetail[] = [];

    for (const check of checks) {
      const value = this.getPathValue(target, check.path);

      if (check.exists !== undefined) {
        const exists = value !== undefined;
        if (exists !== check.exists) {
          failures.push({
            criterion: `${context.criterionPrefix}.exists`,
            expected: check.exists ? "exists" : "does not exist",
            actual: exists ? "exists" : "does not exist",
            message: `${context.messagePrefix}${check.path}: expected ${check.exists ? "to exist" : "not to exist"}`,
          });
        }
      }

      if (check.equals !== undefined && value !== check.equals) {
        failures.push({
          criterion: `${context.criterionPrefix}.equals`,
          expected: JSON.stringify(check.equals),
          actual: JSON.stringify(value),
          message: `${context.messagePrefix}${check.path}: expected ${JSON.stringify(check.equals)}, got ${JSON.stringify(value)}`,
        });
      }

      if (check.matches !== undefined) {
        failures.push(...this.validatePathRegex(value, check, context));
      }
    }

    return failures;
  }

  private validatePathRegex(
    value: unknown,
    check: PathValidation,
    context: PathValidationContext,
  ): FailureDetail[] {
    const pattern = new RegExp(check.matches ?? "");

    if (typeof value === "string" && pattern.test(value)) {
      return [];
    }

    return [
      {
        criterion: `${context.criterionPrefix}.matches`,
        expected: `matches /${check.matches}/`,
        actual:
          typeof value === "string"
            ? context.formatActualString(value)
            : typeof value,
        message: `${context.messagePrefix}${check.path}: expected to match /${check.matches}/`,
      },
    ];
  }

  private findMatchingItems(
    output: unknown[],
    check: ItemsContain,
    pattern: RegExp,
  ): Array<{ index: number; value: string }> {
    const matchingItems: Array<{ index: number; value: string }> = [];

    output.forEach((item, index) => {
      const value = this.getFieldValue(item, check.field);
      if (typeof value === "string" && pattern.test(value)) {
        matchingItems.push({ index, value });
      }
    });

    return matchingItems;
  }

  /**
   * Build a regex pattern from either pattern string or words array
   * Words automatically get word boundaries applied
   */
  private buildPattern(check: ItemsContain): PatternMatch {
    if (check.pattern) {
      return {
        pattern: new RegExp(check.pattern),
        description: `/${check.pattern}/`,
      };
    }

    if (check.words && check.words.length > 0) {
      // Escape special regex characters in words and join with OR
      const escaped = check.words.map((word) =>
        word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
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
