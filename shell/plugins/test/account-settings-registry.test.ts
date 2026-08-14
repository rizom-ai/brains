import { describe, expect, it } from "bun:test";
import { z } from "@brains/utils/zod";
import {
  AccountSettingsRegistry,
  defineAccountSettings,
  type AccountSettingsBackend,
  type AccountSettingsStorageIdentity,
  type AccountSettingsStoredValues,
  type StoredAccountSettings,
} from "../src";

class MemoryBackend implements AccountSettingsBackend {
  readonly records = new Map<string, StoredAccountSettings>();

  private key(identity: AccountSettingsStorageIdentity): string {
    return JSON.stringify([
      identity.packageName,
      identity.definitionId,
      identity.actorId,
    ]);
  }

  read(
    identity: AccountSettingsStorageIdentity,
  ): Promise<StoredAccountSettings | null> {
    return Promise.resolve(this.records.get(this.key(identity)) ?? null);
  }

  list(input: {
    readonly packageName: string;
    readonly definitionId: string;
  }): Promise<
    readonly {
      readonly actorId: string;
      readonly values: AccountSettingsStoredValues;
      readonly revision: number;
    }[]
  > {
    const prefix = JSON.stringify([
      input.packageName,
      input.definitionId,
    ]).slice(0, -1);
    return Promise.resolve(
      [...this.records.entries()]
        .filter(([key]) => key.startsWith(prefix))
        .map(([key, value]) => ({
          actorId: z
            .tuple([z.string(), z.string(), z.string()])
            .parse(JSON.parse(key))[2],
          ...value,
        })),
    );
  }

  write(
    identity: AccountSettingsStorageIdentity,
    values: AccountSettingsStoredValues,
  ): Promise<StoredAccountSettings> {
    const key = this.key(identity);
    const stored = {
      values,
      revision: (this.records.get(key)?.revision ?? 0) + 1,
    };
    this.records.set(key, stored);
    return Promise.resolve(stored);
  }

  delete(identity: AccountSettingsStorageIdentity): Promise<boolean> {
    return Promise.resolve(this.records.delete(this.key(identity)));
  }

  deleteActor(actorId: string): Promise<number> {
    let count = 0;
    for (const key of this.records.keys()) {
      const parsed = z
        .tuple([z.string(), z.string(), z.string()])
        .parse(JSON.parse(key));
      if (parsed[2] === actorId && this.records.delete(key)) count++;
    }
    return Promise.resolve(count);
  }
}

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
