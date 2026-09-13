import { z } from "@brains/utils/zod";
import { types } from "node:util";

export const MAX_ERROR_BYTES: number = 16 * 1024;
export const MAX_ERROR_NODES: number = 16;
export const MAX_ERROR_DEPTH: number = 4;
export const MAX_ERROR_CHILDREN: number = 8;
const NAME_BYTES = 64;
const MESSAGE_BYTES = 512;
const CODE_BYTES = 64;
const nodeSchema: z.ZodObject<{
  name: z.ZodString;
  message: z.ZodString;
  code: z.ZodOptional<z.ZodString>;
  cause: z.ZodOptional<z.ZodNumber>;
  errors: z.ZodOptional<z.ZodArray<z.ZodNumber>>;
}> = z.strictObject({
  name: z.string().max(NAME_BYTES),
  message: z.string().max(MESSAGE_BYTES),
  code: z.string().max(CODE_BYTES).optional(),
  cause: z
    .number()
    .int()
    .min(0)
    .max(MAX_ERROR_NODES - 1)
    .optional(),
  errors: z
    .array(
      z
        .number()
        .int()
        .min(0)
        .max(MAX_ERROR_NODES - 1),
    )
    .max(MAX_ERROR_CHILDREN)
    .optional(),
});
type ErrorNode = z.output<typeof nodeSchema>;
function textBytes(text: string): number {
  return Buffer.byteLength(JSON.stringify(text)) - 2;
}
export const errorSchema: z.ZodObject<{
  nodes: z.ZodArray<typeof nodeSchema>;
  truncated: z.ZodBoolean;
}> = z
  .strictObject({
    nodes: z.array(nodeSchema).min(1).max(MAX_ERROR_NODES),
    truncated: z.boolean(),
  })
  .superRefine((graph, context) => {
    const invalid = (): void => {
      context.addIssue({
        code: "custom",
        message: "Invalid bounded error graph",
      });
    };
    if (Buffer.byteLength(JSON.stringify(graph)) > MAX_ERROR_BYTES) invalid();
    for (const node of graph.nodes) {
      if (
        textBytes(node.name) > NAME_BYTES ||
        textBytes(node.message) > MESSAGE_BYTES ||
        (node.code !== undefined && textBytes(node.code) > CODE_BYTES)
      )
        invalid();
    }
    const visited = new Set<number>([0]);
    const queue = [{ id: 0, depth: 0 }];
    for (const item of queue) {
      const node = graph.nodes[item.id];
      if (!node || item.depth > MAX_ERROR_DEPTH) {
        invalid();
        continue;
      }
      for (const id of [
        ...(node.errors ?? []),
        ...(node.cause === undefined ? [] : [node.cause]),
      ]) {
        if (!graph.nodes[id]) invalid();
        else if (!visited.has(id)) {
          visited.add(id);
          queue.push({ id, depth: item.depth + 1 });
        }
      }
    }
    if (visited.size !== graph.nodes.length) invalid();
  });
export type ProofError = z.output<typeof errorSchema>;

/** Bounded diagnostic graph, not serialization of arbitrary objects or stacks. */
export function serializeError(input: unknown): ProofError {
  let truncated = false;
  const omit = (): void => {
    truncated = true;
  };
  // Inspect data descriptors only. Do not execute error getters, proxies,
  // custom stringifiers or aggregate iterators while reporting a failure.
  const field = (
    object: object,
    key: string,
  ): { present: boolean; value: unknown } => {
    let target: object | null = object;
    for (let depth = 0; target !== null && depth <= MAX_ERROR_DEPTH; depth++) {
      if (types.isProxy(target)) {
        omit();
        return { present: false, value: undefined };
      }
      const descriptor = Object.getOwnPropertyDescriptor(target, key);
      if (descriptor) {
        if (!("value" in descriptor)) {
          omit();
          return { present: true, value: undefined };
        }
        const value: unknown = descriptor.value;
        return { present: true, value };
      }
      const prototype: unknown = Object.getPrototypeOf(target);
      target =
        typeof prototype === "object" || typeof prototype === "function"
          ? prototype
          : null;
    }
    if (target !== null) omit();
    return { present: false, value: undefined };
  };
  const clip = (text: string, limit: number): string => {
    let result = "";
    let used = 0;
    // Slice before encoding: never allocate a UTF-8 copy of an unbounded message.
    for (const character of text.slice(0, limit + 1)) {
      const bytes = textBytes(character);
      if (used + bytes > limit) break;
      result += character;
      used += bytes;
    }
    if (result.length !== text.length) omit();
    return result;
  };
  const messageText = (text: string): string => {
    // Drizzle embeds SQL parameters in its error message, including BLOBs.
    // Inspect only a bounded prefix; never forward even a prefix of that payload.
    if (text.slice(0, MESSAGE_BYTES + 1).includes("Failed query:")) {
      omit();
      return "Failed query (SQL and parameters omitted)";
    }
    return clip(text, MESSAGE_BYTES);
  };
  const nodes: ErrorNode[] = [];
  const queue: { value: unknown; depth: number }[] = [];
  const seen = new WeakMap<object, number>();
  const intern = (value: unknown, depth: number): number | undefined => {
    const object =
      value !== null &&
      (typeof value === "object" || typeof value === "function")
        ? value
        : undefined;
    const known = object === undefined ? undefined : seen.get(object);
    if (known !== undefined) return known;
    if (depth > MAX_ERROR_DEPTH || nodes.length >= MAX_ERROR_NODES) {
      omit();
      return undefined;
    }
    const id = nodes.length;
    nodes.push({ name: "Error", message: "Error details omitted" });
    queue.push({ value, depth });
    if (object !== undefined) seen.set(object, id);
    return id;
  };
  intern(input, 0);
  // Breadth first: a deep primary cause cannot starve its sibling cleanup error.
  for (const [id, item] of queue.entries()) {
    const node = nodes[id];
    if (!node) throw new Error("Missing bounded error node");
    const value = item.value;
    if (types.isProxy(value) || !types.isNativeError(value)) {
      omit();
      node.name = "NonError";
      node.message =
        typeof value === "string"
          ? messageText(value)
          : "Non-Error thrown value omitted";
      continue;
    }
    if (field(value, "diagnosticsTruncated").value === true) omit();
    const name = field(value, "name");
    const message = field(value, "message");
    const code = field(value, "code");
    node.name =
      typeof name.value === "string" ? clip(name.value, NAME_BYTES) : "Error";
    if (name.present && typeof name.value !== "string") omit();
    if (typeof message.value === "string")
      node.message = messageText(message.value);
    else if (!message.present) node.message = "";
    else omit();
    if (typeof code.value === "string")
      node.code = clip(code.value, CODE_BYTES);
    else if (code.present) omit();
    const errors = field(value, "errors");
    if (errors.present) {
      node.errors = [];
      if (types.isProxy(errors.value) || !Array.isArray(errors.value)) omit();
      else {
        const length = errors.value.length;
        if (length > MAX_ERROR_CHILDREN) omit();
        for (
          let index = 0;
          index < Math.min(length, MAX_ERROR_CHILDREN);
          index++
        ) {
          const child = field(errors.value, String(index));
          const reference = intern(child.value, item.depth + 1);
          if (reference !== undefined) node.errors.push(reference);
        }
      }
    }
    const cause = field(value, "cause");
    if (cause.present) {
      const reference = intern(cause.value, item.depth + 1);
      if (reference !== undefined) node.cause = reference;
    }
  }
  return errorSchema.parse({ nodes, truncated });
}

export function deserializeError(input: unknown): Error {
  const graph = errorSchema.parse(input);
  const errors = graph.nodes.map((node) => {
    const error =
      node.errors === undefined
        ? new Error(node.message)
        : new AggregateError([], node.message);
    Object.defineProperty(error, "name", {
      value: node.name,
      configurable: true,
      writable: true,
    });
    if (node.code !== undefined)
      Object.defineProperty(error, "code", {
        value: node.code,
        configurable: true,
      });
    if (graph.truncated)
      Object.defineProperty(error, "diagnosticsTruncated", { value: true });
    return error;
  });
  for (const [index, node] of graph.nodes.entries()) {
    const error = errors[index];
    if (!error) throw new Error("Missing reconstructed error node");
    if (node.cause !== undefined)
      Object.defineProperty(error, "cause", {
        value: errors[node.cause],
        configurable: true,
        writable: true,
      });
    if (node.errors !== undefined)
      Object.defineProperty(error, "errors", {
        value: node.errors.map((id) => errors[id]),
        configurable: true,
        writable: true,
      });
  }
  const root = errors[0];
  if (!root) throw new Error("Missing reconstructed root error");
  return root;
}
export function errorSummary(input: unknown): string {
  return serializeError(input).nodes[0]?.message ?? "Error details omitted";
}
