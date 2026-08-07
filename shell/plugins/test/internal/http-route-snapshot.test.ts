import { describe, expect, it } from "bun:test";
import {
  bindHttpRouteSnapshot,
  forwardHttpRouteSnapshot,
  getHttpRouteSnapshot,
} from "../../src/internal/http-route-snapshot";
import type { RegisteredHttpRoute } from "../../src/types/http-routes";

describe("HTTP route snapshot binding", () => {
  it("resolves the bound snapshot without exposing it on the owner", () => {
    const owner = {};
    const snapshot: readonly RegisteredHttpRoute[] = Object.freeze([]);

    bindHttpRouteSnapshot(owner, () => snapshot);

    expect(getHttpRouteSnapshot(owner)).toBe(snapshot);
    expect(Object.keys(owner)).toEqual([]);
  });

  it("forwards a provider to a scoped owner", () => {
    const source = {};
    const scoped = {};
    const snapshot: readonly RegisteredHttpRoute[] = Object.freeze([]);

    bindHttpRouteSnapshot(source, () => snapshot);
    forwardHttpRouteSnapshot(source, scoped);

    expect(getHttpRouteSnapshot(scoped)).toBe(snapshot);
  });

  it("rejects missing and duplicate bindings", () => {
    const owner = {};

    expect(() => getHttpRouteSnapshot(owner)).toThrow(
      "HTTP route snapshot provider is not bound",
    );

    bindHttpRouteSnapshot(owner, () => []);
    expect(() => bindHttpRouteSnapshot(owner, () => [])).toThrow(
      "HTTP route snapshot provider is already bound",
    );
  });
});
