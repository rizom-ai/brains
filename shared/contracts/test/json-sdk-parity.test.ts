import { describe, expect, it } from "bun:test";
import type {
  IsJsonValue as SdkIsJsonValue,
  JsonObject as SdkJsonObject,
  JsonObjectOutputGuard as SdkJsonObjectOutputGuard,
  JsonPrimitive as SdkJsonPrimitive,
  JsonValue as SdkJsonValue,
} from "@rizom/site";
import type {
  IsJsonValue,
  JsonObject,
  JsonObjectOutputGuard,
  JsonPrimitive,
  JsonValue,
} from "../src/json";

/**
 * `@rizom/site` is published and may not depend on private `@brains/*`
 * packages, so it carries its own copy of this JSON type machinery. The copy is
 * deliberate; what was missing is anything holding the two together.
 *
 * The deploy scripts solve the same problem — a copy required at a publish
 * boundary — with a generator plus a drift test. These types cannot be
 * generated (they are hand-written conditional types), so the drift test is the
 * whole guard. It runs at typecheck time: if either side gains, loses, or
 * reshapes a member, `Identical` resolves to `false` and the build fails here
 * rather than silently in whatever consumer depended on the difference.
 *
 * `IsJsonValue` and `JsonObjectOutputGuard` are generic, so they are compared
 * by application over representative arguments rather than directly.
 */

type Identical<A, B> = [A] extends [B]
  ? [B] extends [A]
    ? true
    : false
  : false;
type AssertTrue<T extends true> = T;

interface Nested {
  a: string;
  b: { c: number[] };
}

type _JsonPrimitive = AssertTrue<Identical<JsonPrimitive, SdkJsonPrimitive>>;
type _JsonValue = AssertTrue<Identical<JsonValue, SdkJsonValue>>;
type _JsonObject = AssertTrue<Identical<JsonObject, SdkJsonObject>>;

type _IsJsonValuePrimitive = AssertTrue<
  Identical<IsJsonValue<string>, SdkIsJsonValue<string>>
>;
type _IsJsonValueNested = AssertTrue<
  Identical<IsJsonValue<Nested>, SdkIsJsonValue<Nested>>
>;
type _IsJsonValueFunction = AssertTrue<
  Identical<IsJsonValue<() => void>, SdkIsJsonValue<() => void>>
>;
type _IsJsonValueUndefined = AssertTrue<
  Identical<IsJsonValue<string | undefined>, SdkIsJsonValue<string | undefined>>
>;

type _GuardObject = AssertTrue<
  Identical<JsonObjectOutputGuard<Nested>, SdkJsonObjectOutputGuard<Nested>>
>;
type _GuardArray = AssertTrue<
  Identical<JsonObjectOutputGuard<string[]>, SdkJsonObjectOutputGuard<string[]>>
>;

// The assertions above are the test; these keep them from being reported as
// unused declarations.
export type ParityAssertions = [
  _JsonPrimitive,
  _JsonValue,
  _JsonObject,
  _IsJsonValuePrimitive,
  _IsJsonValueNested,
  _IsJsonValueFunction,
  _IsJsonValueUndefined,
  _GuardObject,
  _GuardArray,
];

describe("@rizom/site JSON type parity", () => {
  it("keeps the published copy identical to @brains/contracts", () => {
    // Parity is enforced by the type-level assertions above, which fail the
    // package typecheck. This case documents that the guard exists and is what
    // a reader lands on when the typecheck error points here.
    const assertions: ParityAssertions = [
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
    ];
    expect(assertions).toHaveLength(9);
  });
});
