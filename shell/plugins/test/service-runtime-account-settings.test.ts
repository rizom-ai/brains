import { describe, expect, it } from "bun:test";
import { z } from "@brains/utils/zod";
import { createMockShell, type MockShell } from "../src/test/mock-shell";
import { MemoryAccountSettingsBackend } from "../src/test/memory-account-settings-backend";
import { defineAccountSettings } from "../src";
import { probeRuntime } from "../src/test/probe-service-runtime";

/**
 * A first-party service converted from a class keeps its account settings
 * as the class kept them through context.accountSettings: registered under
 * its own plugin id and the definition id the class named, read, written
 * and forgotten for the account its own code names. It reaches only the
 * registrations it made: another package's settings are refused.
 */

const linkedIn = defineAccountSettings({
  title: "LinkedIn",
  schema: z.object({
    accessToken: z.string().trim().min(1),
    expiresAt: z.iso.datetime().optional(),
  }),
  fields: {
    accessToken: { label: "Access token", secret: true },
    expiresAt: { label: "Expires" },
  },
});

function shellWithStore(): {
  shell: MockShell;
  backend: MemoryAccountSettingsBackend;
} {
  const shell = createMockShell();
  const backend = new MemoryAccountSettingsBackend();
  shell.getAccountSettingsRegistry().bindBackend(backend);
  return { shell, backend };
}

describe("a first-party service keeping its account settings as its class did", () => {
  it("registers under its plugin id and the definition id its class named, and reads a row its class stored", async () => {
    const { shell, backend } = shellWithStore();
    // A token row exactly as the class stored it.
    await backend.write(
      {
        packageName: "@brains/linkedin-import",
        definitionId: "linkedin",
        actorId: "u-ada",
      },
      { accessToken: "stored-token", expiresAt: "2099-01-01T00:00:00Z" },
    );
    const runtime = await probeRuntime(shell, { id: "linkedin-import" });
    const registration = runtime.accountSettings.register({
      ownerPluginId: "linkedin-import",
      packageName: "@brains/linkedin-import",
      definitionId: "linkedin",
      definition: linkedIn,
    });
    expect(
      await runtime.accountSettings.getForActor(registration, "u-ada"),
    ).toEqual({
      accessToken: "stored-token",
      expiresAt: "2099-01-01T00:00:00Z",
    });
    expect(
      shell
        .getAccountSettingsRegistry()
        .listRegistrations()
        .map(({ id }) => id),
    ).toEqual([registration.id]);
  });

  it("writes and forgets the settings of the account it names", async () => {
    const { shell, backend } = shellWithStore();
    const runtime = await probeRuntime(shell, { id: "linkedin-import" });
    const registration = runtime.accountSettings.register({
      ownerPluginId: "linkedin-import",
      packageName: "@brains/linkedin-import",
      definitionId: "linkedin",
      definition: linkedIn,
    });
    await runtime.accountSettings.save(registration.id, "u-ada", {
      accessToken: "new-token",
    });
    expect(
      await backend.read({
        packageName: "@brains/linkedin-import",
        definitionId: "linkedin",
        actorId: "u-ada",
      }),
    ).toMatchObject({ values: { accessToken: "new-token" } });
    expect(await runtime.accountSettings.delete(registration.id, "u-ada")).toBe(
      true,
    );
    expect(
      await runtime.accountSettings.getForActor(registration, "u-ada"),
    ).toBeNull();
  });

  it("registers no settings under another plugin's id", async () => {
    const { shell } = shellWithStore();
    const runtime = await probeRuntime(shell, { id: "linkedin-import" });
    expect(() =>
      runtime.accountSettings.register({
        ownerPluginId: "profile",
        packageName: "@brains/linkedin-import",
        definitionId: "linkedin",
        definition: linkedIn,
      }),
    ).toThrow(
      'Service "linkedin-import" registers account settings only under its own plugin id',
    );
  });

  it("reads, writes and forgets no other package's settings", async () => {
    const { shell } = shellWithStore();
    const other = shell.getAccountSettingsRegistry().register({
      ownerPluginId: "mail",
      packageName: "@brains/mail",
      definitionId: "mail",
      definition: linkedIn,
    });
    await shell
      .getAccountSettingsRegistry()
      .save(other.id, "u-ada", { accessToken: "mail-token" });
    const runtime = await probeRuntime(shell, { id: "linkedin-import" });
    const refusal = `Service "linkedin-import" reaches only the account settings it registered`;
    expect(runtime.accountSettings.getForActor(other, "u-ada")).rejects.toThrow(
      refusal,
    );
    expect(
      runtime.accountSettings.save(other.id, "u-ada", { accessToken: "x" }),
    ).rejects.toThrow(refusal);
    expect(runtime.accountSettings.delete(other.id, "u-ada")).rejects.toThrow(
      refusal,
    );
    expect(
      await shell.getAccountSettingsRegistry().getForActor(other, "u-ada"),
    ).toEqual({ accessToken: "mail-token" });
  });
});
