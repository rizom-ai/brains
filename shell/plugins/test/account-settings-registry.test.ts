import { describe, expect, it } from "bun:test";
import { z } from "@brains/utils/zod";
import { AccountSettingsRegistry, defineAccountSettings } from "../src";
import { MemoryAccountSettingsBackend as MemoryBackend } from "../src/test/memory-account-settings-backend";

const settings = defineAccountSettings({
  title: "Mailbox",
  schema: z.object({
    host: z.string().min(1),
    port: z.number().int().default(993),
    secure: z.boolean().default(true),
    password: z.string().min(1),
  }),
  fields: {
    host: { label: "Host" },
    port: { label: "Port", control: "number" },
    secure: { label: "TLS", control: "checkbox" },
    password: { label: "Password", secret: true },
  },
});

describe("account settings registry", () => {
  it("validates values, redacts secrets, preserves omitted secret replacements, and isolates actors", async () => {
    const registry = new AccountSettingsRegistry();
    const backend = new MemoryBackend();
    registry.bindBackend(backend);
    const registration = registry.register({
      ownerPluginId: "mailbox",
      packageName: "@fixture/mailbox",
      definitionId: "mailbox",
      definition: settings,
    });

    const saved = await registry.save(registration.id, "actor-1", {
      host: "imap.example.com",
      password: "first-secret",
    });
    expect(saved).toMatchObject({ configured: true, revision: 1 });
    expect(saved.fields.find(({ name }) => name === "password")).toEqual({
      name: "password",
      label: "Password",
      control: "text",
      secret: true,
      required: true,
      set: true,
    });
    expect(JSON.stringify(saved)).not.toContain("first-secret");
    expect(await registry.getForActor(registration, "actor-1")).toEqual({
      host: "imap.example.com",
      port: 993,
      secure: true,
      password: "first-secret",
    });
    expect(await registry.getForActor(registration, "actor-2")).toBeNull();

    await registry.save(registration.id, "actor-1", {
      host: "mail.example.com",
      password: "",
    });
    expect(await registry.getForActor(registration, "actor-1")).toMatchObject({
      host: "mail.example.com",
      password: "first-secret",
    });

    expect(
      registry.save(registration.id, "actor-1", { unknown: "value" }),
    ).rejects.toThrow("is not declared");
    expect(
      registry.save(registration.id, "actor-1", { password: "replacement" }),
    ).rejects.toThrow("Invalid input");
  });

  it("derives optional defaults for an unconfigured form", async () => {
    const registry = new AccountSettingsRegistry();
    registry.bindBackend(new MemoryBackend());
    registry.register({
      ownerPluginId: "mailbox",
      packageName: "@fixture/mailbox",
      definitionId: "mailbox",
      definition: settings,
    });

    const [form] = await registry.listForms("actor-1");
    expect(form).toMatchObject({ configured: false, revision: null });
    expect(form?.fields.find(({ name }) => name === "port")).toMatchObject({
      required: false,
      value: 993,
    });
    expect(form?.fields.find(({ name }) => name === "secure")).toMatchObject({
      required: false,
      value: true,
    });
  });

  it("publishes changes for account-task reconciliation and removes all actor records", async () => {
    const registry = new AccountSettingsRegistry();
    registry.bindBackend(new MemoryBackend());
    const registration = registry.register({
      ownerPluginId: "mailbox",
      packageName: "@fixture/mailbox",
      definitionId: "mailbox",
      definition: settings,
    });
    let changes = 0;
    registry.subscribe(registration, () => changes++);

    await registry.save(registration.id, "actor-1", {
      host: "one.example.com",
      password: "one",
    });
    await registry.save(registration.id, "actor-2", {
      host: "two.example.com",
      password: "two",
    });
    expect(await registry.listConfigured(registration)).toHaveLength(2);
    expect(changes).toBe(2);

    expect(await registry.deleteActor("actor-1")).toBe(1);
    expect(await registry.getForActor(registration, "actor-1")).toBeNull();
    expect(changes).toBe(3);
  });
});
