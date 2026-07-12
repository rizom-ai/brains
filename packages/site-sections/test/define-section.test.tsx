/** @jsxImportSource preact */
import { describe, expect, test } from "bun:test";
import type { JSX } from "preact";
import {
  defineSection,
  sectionGroup,
  z,
  type ComponentType,
  type SectionDefinition,
} from "../src";

const heroSchema = z.object({
  headline: z.string(),
  count: z.number(),
});

function Hero({ headline, count }: z.infer<typeof heroSchema>): JSX.Element {
  return (
    <h1>
      {headline} {count}
    </h1>
  );
}

const heroSection = defineSection(heroSchema, Hero, {
  title: "Hero",
  description: "The hero section",
});

/*
 * The tie is verified positively at typecheck: for any schema `S`,
 * `defineSection` binds the section's component to exactly
 * `ComponentType<z.infer<S>>` — no widening to `unknown`. If the signature ever
 * loosened, `Equal` becomes false and `Assert<false>` fails to compile. One
 * positive assertion covers both directions (a correct component compiles; a
 * mismatched one is rejected) without `@ts-expect-error`, which would suppress
 * any error on the line, not just the one we mean to catch. Self-contained (no
 * reference to the runtime consts above) so `--isolatedDeclarations` is happy.
 */
type Assert<T extends true> = T;
type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false;

export type ComponentPropsTiedToSchema = Assert<
  Equal<
    SectionDefinition<z.ZodObject<{ headline: z.ZodString }>>["component"],
    ComponentType<{ headline: string }>
  >
>;

describe("defineSection", () => {
  test("packages the schema, component, and metadata", () => {
    expect(heroSection.schema).toBe(heroSchema);
    expect(heroSection.component).toBe(Hero);
    expect(heroSection.title).toBe("Hero");
    expect(heroSection.description).toBe("The hero section");
  });
});

describe("sectionGroup", () => {
  test("bundles heterogeneous sections under a namespace", () => {
    const group = sectionGroup("home", {
      hero: heroSection,
      note: defineSection(
        z.object({ body: z.string() }),
        ({ body }): JSX.Element => <p>{body}</p>,
        { title: "Note", description: "d" },
      ),
    });

    expect(group.namespace).toBe("home");
    expect(Object.keys(group.sections)).toEqual(["hero", "note"]);
  });
});
