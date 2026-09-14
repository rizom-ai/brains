import { isPlainRecord } from "@brains/utils/predicates";
import { z } from "@brains/utils/zod";

export const MAX_GENERATION_TARGETS = 256;
export const MAX_GENERATION_REQUEST_BYTES = 1_048_576;
export const MAX_GENERATION_JSON_DEPTH = 32;

export class GenerationLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GenerationLimitError";
  }
}

const SHORT_ESCAPES = '"\\\b\f\n\r\t';

/**
 * Extra bytes JSON.stringify adds for one code point beyond its UTF-8 length:
 * short escapes add one, other control characters add five, and a lone
 * surrogate becomes a six-byte escape where UTF-8 holds a three-byte
 * replacement. Iterating code points keeps control characters out of a regex.
 */
function jsonEscapeOverhead(char: string): number {
  const code = char.codePointAt(0) ?? 0;
  if (SHORT_ESCAPES.includes(char)) return 1;
  if (code < 0x20) return 5;
  if (code >= 0xd800 && code <= 0xdfff) return 3;
  return 0;
}

/** Serialized size of a JSON string without allocating the escaped copy. */
function jsonStringBytes(text: string): number {
  let overhead = 0;
  for (const char of text) overhead += jsonEscapeOverhead(char);
  return Buffer.byteLength(text, "utf8") + 2 + overhead;
}

/**
 * Bounded traversal before recursive Zod validation. Exact UTF-8 JSON size for
 * JSON values; optional undefined object fields are omitted. Schema validation
 * still owns non-JSON input handling (including domain metadata transforms).
 * Never invoke toJSON hooks or serialize the complete input just to size it.
 */
export function assertGenerationJsonLimits(value: unknown): void {
  let bytes = 0;
  const active = new WeakSet<object>();
  const add = (count: number): void => {
    bytes += count;
    if (bytes > MAX_GENERATION_REQUEST_BYTES) {
      throw new GenerationLimitError(
        `Content generation exceeds ${MAX_GENERATION_REQUEST_BYTES} UTF-8 JSON bytes`,
      );
    }
  };
  const visit = (item: unknown, depth: number): void => {
    if (depth > MAX_GENERATION_JSON_DEPTH) {
      throw new GenerationLimitError(
        `Content generation exceeds JSON depth ${MAX_GENERATION_JSON_DEPTH}`,
      );
    }
    if (typeof item === "string") {
      add(jsonStringBytes(item));
      return;
    }
    if (item === null) {
      add(4);
      return;
    }
    if (typeof item === "boolean") {
      add(item ? 4 : 5);
      return;
    }
    if (typeof item === "number") {
      add(JSON.stringify(item).length);
      return;
    }
    if (typeof item !== "object") return;
    if (active.has(item))
      throw new GenerationLimitError(
        "Content generation cannot contain circular data",
      );
    active.add(item);
    add(2);
    let entries = 0;
    if (Array.isArray(item)) {
      for (const child of item) {
        if (entries++ > 0) add(1);
        if (child === undefined) add(4);
        else visit(child, depth + 1);
      }
    } else {
      for (const key of Object.keys(item)) {
        const child: unknown = Reflect.get(item, key);
        if (child === undefined) continue;
        if (entries++ > 0) add(1);
        add(jsonStringBytes(key) + 1);
        visit(child, depth + 1);
      }
    }
    active.delete(item);
  };
  visit(value, 0);
}

/** Inspect only submission data, not runtime signals, definitions, or queue options. */
export function assertGenerationRequestLimits(value: unknown): void {
  if (!isPlainRecord(value)) return;
  const targets = value["targets"];
  if (Array.isArray(targets) && targets.length > MAX_GENERATION_TARGETS) {
    throw new GenerationLimitError(
      `Content generation exceeds ${MAX_GENERATION_TARGETS} targets`,
    );
  }
  assertGenerationJsonLimits({ targets, options: value["options"] });
}

const LIMIT_ISSUE = "generationLimit";

/** Preserve Zod's safeParse contract while rejecting excessive/cyclic input early. */
export function generationLimitPreprocessor(
  check: (value: unknown) => void,
): (value: unknown, context: z.RefinementCtx) => unknown {
  return (value, context): unknown => {
    try {
      check(value);
    } catch (error) {
      if (!(error instanceof GenerationLimitError)) throw error;
      context.addIssue({
        code: "custom",
        message: error.message,
        params: { [LIMIT_ISSUE]: true },
      });
      return z.NEVER;
    }
    return value;
  };
}

/**
 * Turn a parse failure back into the typed, non-retryable limit error when the
 * preprocessor rejected the input, so a caller parsing once gets one error type.
 */
export function throwGenerationParseError(error: z.ZodError): never {
  const limit = error.issues.find(
    (issue) => issue.code === "custom" && issue.params?.[LIMIT_ISSUE] === true,
  );
  if (limit) throw new GenerationLimitError(limit.message);
  throw error;
}
