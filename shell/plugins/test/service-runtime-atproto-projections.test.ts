import { describe, expect, it } from "bun:test";
import {
  canonicalAtprotoLexicons,
  type AtprotoProjection,
} from "@brains/atproto-contracts";
import { createMockShell } from "../src/test/mock-shell";
import { probeService } from "../src/test/probe-service-runtime";

/**
 * A first-party service converted from a class reads the AT Protocol
 * projections entity packages registered as its class did through
 * context.atprotoProjections: a type's newest projection, none for a type
 * that registered none. Atproto publishes a projected entity through it.
 */

describe("a first-party service's AT Protocol projections", () => {
  it("reads the projection an entity package registered, newest first", async () => {
    const shell = createMockShell();
    const registry = shell.getAtprotoProjectionRegistry();
    const projection: AtprotoProjection = {
      entityType: "post",
      collection: "ai.rizom.brain.card",
      lexicon: canonicalAtprotoLexicons["ai.rizom.brain.card"],
      buildRecord: async () => ({ text: "A post" }),
    };
    registry.register(projection);
    const { runtime } = await probeService(shell);

    expect(runtime.atprotoProjections.get("post")).toBe(registry.get("post"));
    expect(runtime.atprotoProjections.get("note")).toBeUndefined();
  });
});
