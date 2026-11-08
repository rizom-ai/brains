import type { ToolAnnotations as SdkToolAnnotations } from "@modelcontextprotocol/server";
import type { ToolAnnotations } from "../src";

// Compile-only. The restated annotations and the MCP SDK's must stay
// assignable both ways, so the typecheck fails when the SDK changes shape.
type AssignableBothWays<A, B> = [A] extends [B]
  ? [B] extends [A]
    ? true
    : false
  : false;
type Expect<T extends true> = T;

export type ToolAnnotationsAssertions = [
  Expect<AssignableBothWays<ToolAnnotations, SdkToolAnnotations>>,
];
