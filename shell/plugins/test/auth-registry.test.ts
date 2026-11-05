import { describe, expect, it } from "bun:test";
import { AuthRegistry, type AuthBackend } from "../src";
import { createMockAuthBackend } from "../test";
import { createMockShell } from "../src/test/mock-shell";
import {
  createPluginScopedShell,
  PluginResourceScope,
} from "../src/manager/plugin-resource-scope";
import { createBasePluginContext } from "../src/base/context";

function backend(issuer: string): AuthBackend {
  return createMockAuthBackend({ getIssuer: () => issuer });
}

describe("AuthRegistry", () => {
  it("has no backend until one is bound", () => {
    expect(new AuthRegistry().get()).toBeUndefined();
  });

  it("serves the bound backend until it is unbound", () => {
    const registry = new AuthRegistry();
    const bound = backend("https://brain.example");

    const unbind = registry.bindBackend(bound);
    expect(registry.get()).toBe(bound);

    unbind();
    expect(registry.get()).toBeUndefined();
  });

  it("refuses a second backend", () => {
    const registry = new AuthRegistry();
    registry.bindBackend(backend("https://one.example"));

    expect(() => registry.bindBackend(backend("https://two.example"))).toThrow(
      "Auth backend is already bound",
    );
  });

  it("ignores a stale unbind after a newer backend took over", () => {
    const registry = new AuthRegistry();
    const unbindFirst = registry.bindBackend(backend("https://one.example"));
    unbindFirst();
    const second = backend("https://two.example");
    registry.bindBackend(second);

    unbindFirst();
    expect(registry.get()).toBe(second);
  });
});

describe("context.auth", () => {
  it("reads the backend another plugin bound on the same shell", () => {
    const shell = createMockShell();
    const bound = backend("https://brain.example");
    createBasePluginContext(shell, "auth-service").auth.bindBackend(bound);

    expect(createBasePluginContext(shell, "studio").auth.get()).toBe(bound);
  });

  it("releases the binding when the binding plugin tears down", async () => {
    const shell = createMockShell();
    const scope = new PluginResourceScope();
    const scoped = createPluginScopedShell(shell, scope);
    createBasePluginContext(scoped, "auth-service").auth.bindBackend(
      backend("https://brain.example"),
    );
    expect(shell.getAuthRegistry().get()).toBeDefined();

    await scope.close();

    expect(shell.getAuthRegistry().get()).toBeUndefined();
  });
});
