import { expect, test, spyOn } from "bun:test";
import { z } from "@brains/utils/zod";
import { defineEntity } from "../src/public/entity-definition";
import { createEntityPackagePlugins } from "../src/entity/declarative-entity-plugin";
import { createPluginHarness } from "../src/test/harness";
import { createOperatorEntities } from "../src/service/operator-entities";
import { operatorValidationCause } from "../src/service/operator-validation";
import {
  issueRouteCaller,
  revokeRouteCaller,
} from "../src/internal/route-caller-authority";

async function fixture(): Promise<ReturnType<typeof createPluginHarness>> {
  const h = createPluginHarness();
  for (const plugin of createEntityPackagePlugins(
    [
      defineEntity({
        type: "source-note",
        purpose: "Source fixture",
        metadata: z.object({}),
      }),
    ],
    [],
    { name: "@fixture/source", version: "1.0.0" },
    (id) => id,
  ))
    await h.installPlugin(plugin);
  for (const visibility of ["public", "shared", "restricted"] as const)
    h.addEntities([
      {
        id: visibility,
        entityType: "source-note",
        visibility,
        content: `Literal ${visibility}: ![image](entity://image/original)`,
        metadata: {},
      },
    ]);
  return h;
}

test("source reads force caller visibility, preserve literal bytes, detach results and sanitize failures", async () => {
  const h = await fixture();
  const other = createPluginHarness();
  const shell = h.getMockShell();
  const reader = createOperatorEntities(shell, { interfaceType: "studio" });
  const principal = {
    actor: { id: "reader" },
    permission: "admin" as const,
    isAnchor: true,
  };
  const admin = issueRouteCaller(principal, shell.getAuthRegistry());
  const guest = issueRouteCaller(
    { ...principal, permission: "public" },
    shell.getAuthRegistry(),
  );
  const trusted = issueRouteCaller(
    { ...principal, permission: "trusted" },
    shell.getAuthRegistry(),
  );
  const raw = spyOn(h.getEntityService(), "getEntityRaw");
  const rendered = spyOn(h.getEntityService(), "getEntity");
  try {
    const request = {
      entityType: "source-note",
      id: "restricted",
      visibilityScope: "restricted",
    };
    expect(await reader.readSource(request, guest)).toBeNull();
    expect(await reader.readSource(request, trusted)).toBeNull();
    expect(
      await reader.readSource({ ...request, id: "shared" }, trusted),
    ).toMatchObject({ visibility: "shared" });
    const record = await reader.readSource(request, admin);
    expect(record?.content).toBe(
      "Literal restricted: ![image](entity://image/original)",
    );
    if (!record) throw new Error("Missing source");
    record.metadata["changed"] = true;
    expect((await reader.readSource(request, admin))?.metadata).toEqual({});
    expect(rendered).not.toHaveBeenCalled();
    expect(raw.mock.calls[0]?.[0].visibilityScope).toBe("public");
    const calls = raw.mock.calls.length;
    for (const forged of [
      { ...admin },
      issueRouteCaller(principal, other.getMockShell().getAuthRegistry()),
    ]) {
      expect(
        await reader
          .readSource(request, forged)
          .catch((error: unknown) => error),
      ).toMatchObject({
        code: "unauthenticated",
        cause: undefined,
      });
    }
    expect(
      await reader
        .readSource({ ...request, id: "x".repeat(2049) }, admin)
        .catch((error: unknown) => error),
    ).toMatchObject({ code: "invalid_input" });
    expect(
      await reader
        .readSource({ ...request, signal: AbortSignal.abort() }, admin)
        .catch((error: unknown) => error),
    ).toMatchObject({ code: "cancelled" });
    expect(
      await reader.readSource({ ...request, entityType: "unknown" }, admin),
    ).toBeNull();
    expect(raw.mock.calls.length).toBe(calls);
    const diagnostic = new Error("PRIVATE database path /secret/source");
    raw.mockRejectedValueOnce(diagnostic);
    const error: unknown = await reader
      .readSource(request, admin)
      .catch((cause: unknown) => cause);
    expect(error).toMatchObject({ cause: undefined });
    expect(String(error)).not.toContain("PRIVATE");
    if (typeof error !== "object" || error === null)
      throw new Error("Expected failure");
    expect(operatorValidationCause(error)).toBe(diagnostic);
  } finally {
    raw.mockRestore();
    rendered.mockRestore();
    await h.reset();
    await other.reset();
  }
});

for (const mode of ["revoked", "request", "runtime"] as const)
  test(`source read cannot return after ${mode} cancellation`, async () => {
    const h = await fixture();
    const shell = h.getMockShell();
    const reader = createOperatorEntities(shell, { interfaceType: "studio" });
    const runtime = new AbortController();
    const request = new AbortController();
    const caller = issueRouteCaller(
      { actor: { id: "admin" }, permission: "admin", isAnchor: true },
      shell.getAuthRegistry(),
      runtime.signal,
    );
    const input = {
      entityType: "source-note",
      id: "public",
      signal: request.signal,
    };
    const record = await reader.readSource(input, caller);
    const started = Promise.withResolvers<void>();
    const pending = Promise.withResolvers<typeof record>();
    const raw = spyOn(
      h.getEntityService(),
      "getEntityRaw",
    ).mockImplementationOnce(async () => {
      started.resolve();
      return pending.promise;
    });
    try {
      const result = reader
        .readSource(input, caller)
        .catch((error: unknown) => error);
      await started.promise;
      if (mode === "revoked") revokeRouteCaller(caller);
      else if (mode === "request")
        request.abort(new Error("Private cancellation detail"));
      else runtime.abort();
      pending.resolve(record);
      expect(await result).toMatchObject({
        code: mode === "revoked" ? "unauthenticated" : "cancelled",
        cause: undefined,
      });
    } finally {
      pending.resolve(record);
      raw.mockRestore();
      await h.reset();
    }
  });
