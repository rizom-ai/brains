import { describe, expect, it } from "bun:test";
import { cpSync, mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  bindHttpRouteSnapshot,
  forwardHttpRouteSnapshot,
  getHttpRouteSnapshot,
} from "../../src/internal/http-route-snapshot";
import type { RegisteredHttpRoute } from "../../src/types/http-routes";

interface SnapshotModule {
  bindHttpRouteSnapshot: typeof bindHttpRouteSnapshot;
  forwardHttpRouteSnapshot: typeof forwardHttpRouteSnapshot;
  getHttpRouteSnapshot: typeof getHttpRouteSnapshot;
}

/**
 * The built binary loads the runtime as separate bundles (brain.js and
 * model.js), each carrying its own instance of this module. Two file copies
 * imported as distinct modules reproduce that: state held in module scope is
 * not shared between them, state carried by the owner object is.
 */
async function importDuplicatedModules(): Promise<
  [SnapshotModule, SnapshotModule]
> {
  const sourcePath = join(
    import.meta.dir,
    "../../src/internal/http-route-snapshot.ts",
  );
  const dir = mkdtempSync(join(tmpdir(), "route-snapshot-dup-"));
  const copyA = join(dir, "copy-a.ts");
  const copyB = join(dir, "copy-b.ts");
  cpSync(sourcePath, copyA);
  cpSync(sourcePath, copyB);
  return [await import(copyA), await import(copyB)];
}

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

  it("resolves a binding made by a duplicated module instance", async () => {
    const [copyA, copyB] = await importDuplicatedModules();
    const owner = {};
    const snapshot: readonly RegisteredHttpRoute[] = Object.freeze([]);

    // brain.js's shell binds; model.js's interface context reads.
    copyA.bindHttpRouteSnapshot(owner, () => snapshot);

    expect(copyB.getHttpRouteSnapshot(owner)).toBe(snapshot);
    expect(getHttpRouteSnapshot(owner)).toBe(snapshot);
  });

  it("forwards to a proxy owner whose reads fall through to the source", () => {
    const shell = { name: "shell" };
    const snapshot: readonly RegisteredHttpRoute[] = Object.freeze([]);
    bindHttpRouteSnapshot(shell, () => snapshot);

    // The plugin resource scope wraps the shell in a get-trap Proxy; property
    // writes land on the underlying shell, so forwarding must tolerate the
    // same provider arriving twice — once per registration scope.
    const scopedA = new Proxy(shell, {
      get: (target, property): unknown => Reflect.get(target, property, target),
    });
    const scopedB = new Proxy(shell, {
      get: (target, property): unknown => Reflect.get(target, property, target),
    });
    forwardHttpRouteSnapshot(shell, scopedA);
    forwardHttpRouteSnapshot(shell, scopedB);

    expect(getHttpRouteSnapshot(scopedA)).toBe(snapshot);
    expect(getHttpRouteSnapshot(scopedB)).toBe(snapshot);
  });

  it("forwards across duplicated module instances", async () => {
    const [copyA, copyB] = await importDuplicatedModules();
    const owner = {};
    const scoped = {};
    const snapshot: readonly RegisteredHttpRoute[] = Object.freeze([]);

    copyA.bindHttpRouteSnapshot(owner, () => snapshot);
    // model.js's plugin-resource-scope forwards to a scoped owner.
    copyB.forwardHttpRouteSnapshot(owner, scoped);

    expect(copyA.getHttpRouteSnapshot(scoped)).toBe(snapshot);
  });
});
