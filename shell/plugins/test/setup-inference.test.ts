import { describe, expect, it } from "bun:test";
import { z } from "@brains/utils/zod";
import { defineServicePlugin } from "../src";

/**
 * What `setup` returns, and where the rest of the package can read it.
 *
 * Everything a package declares used to sit in one object literal, and
 * TypeScript infers a literal's context-sensitive properties in the order they
 * are written. A slot destructuring `state` above `setup` resolved its context
 * while the state type was still unknown, which fixed `state` to an empty
 * object instead of failing — so the contract carried a rule that authors had
 * to order their properties.
 *
 * The declaration is two arguments now: what the package is, then what it
 * does with the state that produced. The behavior object is a separate
 * argument, so its properties can be written in any order. This file is a
 * compile fixture; the assertions keep it honest at runtime.
 */
describe("reading setup state from a behavior slot", () => {
  const configSchema = z.object({
    token: z.string(),
    retries: z.number().default(3),
  });

  it("infers the state whatever order the behavior is written in", () => {
    const definition = defineServicePlugin(
      {
        id: "ordered",
        config: configSchema,
        setup: ({ config, dataDir }) => ({
          token: config.token.toUpperCase(),
          root: dataDir,
          retries: config.retries,
        }),
      },
      {
        // Declared before every other slot, and still typed.
        ready: ({ state }) => {
          const root: string = state.root;
          void root;
        },
        tools: ({ config, state }) => {
          const token: string = state.token;
          const retries: number = state.retries;
          void token;
          void retries;
          void config.token;
          return [];
        },
        instructions: ({ state }) => `sync ${state.root}`,
      },
    );

    expect(definition.id).toBe("ordered");
  });

  it("infers what an async setup resolves to", () => {
    const definition = defineServicePlugin(
      {
        id: "async-setup",
        config: configSchema,
        setup: async ({ config }) => ({ token: config.token, count: 1 }),
      },
      {
        instructions: ({ state }) => `${state.token}:${state.count}`,
      },
    );

    expect(definition.id).toBe("async-setup");
  });

  it("refuses a field the state does not have", () => {
    const definition = defineServicePlugin(
      {
        id: "unknown-field",
        config: configSchema,
        setup: () => ({ token: "t" }),
      },
      {
        // @ts-expect-error the state has no `missing`
        instructions: ({ state }) => state.missing,
      },
    );

    expect(definition.id).toBe("unknown-field");
  });

  it("gives a package with no setup no state to read", () => {
    const definition = defineServicePlugin(
      { id: "stateless", config: configSchema },
      {
        // @ts-expect-error nothing was set up, so there is no token
        instructions: ({ state }) => state.token,
      },
    );

    expect(definition.id).toBe("stateless");
  });

  it("takes a handler written outside the declaration", () => {
    const instructions = ({ state }: { state: { token: string } }): string =>
      state.token;

    const definition = defineServicePlugin(
      {
        id: "extracted",
        config: configSchema,
        setup: () => ({ token: "t" }),
      },
      { instructions },
    );

    expect(definition.id).toBe("extracted");
  });
});
