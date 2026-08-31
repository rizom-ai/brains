import { afterEach, describe, expect, it } from "bun:test";
import { AuthServicePlugin } from "@brains/auth-service";
import type { StudioWorkspaceActor } from "@brains/plugins";
import { createTempDataDir } from "@brains/plugins/test";
import { createMockShell } from "@brains/test-utils";
import {
  actionRequest,
  administrationTab,
  adminActor,
  captureAdminWorkspaces,
  findAction,
  resultField,
  trustedActor,
} from "./studio-workspace-test-helpers";

const authPlugins: AuthServicePlugin[] = [];

afterEach(async () => {
  for (const plugin of authPlugins.splice(0)) await plugin.shutdown?.();
});

function actorFor(
  base: StudioWorkspaceActor,
  user: { userId: string },
): StudioWorkspaceActor {
  return {
    ...base,
    userId: user.userId,
    actor: { kind: "user", userId: user.userId },
  };
}

function findById(value: unknown, id: string): unknown {
  if (value === null || typeof value !== "object") return undefined;
  if (
    Reflect.get(value, "id") === id &&
    Reflect.get(value, "type") === "table"
  ) {
    return value;
  }
  for (const child of Object.values(value)) {
    const result = findById(child, id);
    if (result !== undefined) return result;
  }
  return undefined;
}

function findAnyById(value: unknown, id: string): unknown {
  if (value === null || typeof value !== "object") return undefined;
  if (Reflect.get(value, "id") === id) return value;
  for (const child of Object.values(value)) {
    const result = findAnyById(child, id);
    if (result !== undefined) return result;
  }
  return undefined;
}

function regionIds(value: unknown, region: "primary" | "aside"): string[] {
  if (value === null || typeof value !== "object") return [];
  const blocks = Reflect.get(value, region);
  if (!Array.isArray(blocks)) return [];
  return blocks.flatMap((block) => {
    if (block === null || typeof block !== "object") return [];
    const id = Reflect.get(block, "id");
    return typeof id === "string" ? [id] : [];
  });
}

function formFields(value: unknown): unknown[] {
  if (value === null || typeof value !== "object") return [];
  const form = Reflect.get(value, "form");
  if (form === null || typeof form !== "object") return [];
  const fields = Reflect.get(form, "fields");
  return Array.isArray(fields) ? fields : [];
}

function formFieldNames(value: unknown): string[] {
  return formFields(value).flatMap((field) => {
    if (field === null || typeof field !== "object") return [];
    const name = Reflect.get(field, "name");
    return typeof name === "string" ? [name] : [];
  });
}

function formField(value: unknown, name: string): unknown {
  return formFields(value).find(
    (field) =>
      field !== null &&
      typeof field === "object" &&
      Reflect.get(field, "name") === name,
  );
}

function findRowForPerson(value: unknown, displayName: string): unknown {
  if (value === null || typeof value !== "object") return undefined;
  const cells = Reflect.get(value, "cells");
  if (
    cells !== null &&
    typeof cells === "object" &&
    Reflect.get(cells, "person") === displayName
  ) {
    return value;
  }
  for (const child of Object.values(value)) {
    const result = findRowForPerson(child, displayName);
    if (result !== undefined) return result;
  }
  return undefined;
}

describe("Administration Invitations tab", () => {
  it("preserves the invitation lifecycle without retaining setup URLs", async () => {
    const shell = createMockShell({ domain: "brain.test" });
    shell.getChannelRegistry().registerDescriptor("test", {
      type: "manual-test",
      displayName: "Manual test",
      subjectLabel: "Manual address",
      manualDelivery: true,
    });
    shell.getChannelRegistry().registerDescriptor("test", {
      type: "failing-auto",
      displayName: "Failing automatic test",
      subjectLabel: "Automatic address",
    });
    shell.getChannelRegistry().registerDeliveryProvider("test", {
      channelType: "failing-auto",
      isAvailable: async () => true,
      send: async () => ({ status: "failed", failureCode: "test-failure" }),
    });
    shell.getChannelRegistry().finalize();
    const auth = new AuthServicePlugin({
      storageDir: await createTempDataDir("brains-admin-invitations-"),
    });
    authPlugins.push(auth);
    await auth.register(shell);
    const service = auth.getService();
    const admin = await service.createUser({
      displayName: "Ada Admin",
      role: "admin",
    });
    const trusted = await service.createUser({
      displayName: "Tess Trusted",
      role: "trusted",
    });
    const actor = actorFor(adminActor, admin);
    const deniedActor = actorFor(trustedActor, trusted);

    const workspace = administrationTab(
      await captureAdminWorkspaces(shell),
      "invitations",
    );
    expect(workspace).toMatchObject({
      id: "admin:administration",
      pluginId: "admin",
      rendererName: "DeclarativeOperatorWorkspace",
      permission: "admin",
      urlQuery: true,
    });
    expect(await workspace.accessHandler(actor)).toBe(true);
    expect(await workspace.accessHandler(deniedActor)).toBe(false);

    const initial = await workspace.dataProvider(actor);
    expect(initial).toMatchObject({
      view: {
        title: "Administration",
        primaryAction: {
          actionId: "create-invitation",
          label: "Add a person",
          form: { presentation: "disclosure" },
        },
        blocks: [
          { type: "stats", id: "invitation-totals" },
          { type: "tabs", defaultTab: "invitations" },
        ],
      },
    });
    expect(initial).not.toHaveProperty("view.status");
    const layout = findAnyById(initial, "invitation-layout");
    expect(regionIds(layout, "primary")).toEqual(["invitations"]);
    expect(findById(initial, "invitations")).toMatchObject({
      type: "table",
      query: { pagination: { total: 0 } },
    });
    expect(regionIds(layout, "aside")).toEqual(["invite-peer"]);
    const create = findAction(initial, "Add a person");
    expect(create).toMatchObject({
      actionId: "create-invitation",
      form: {
        presentation: "disclosure",
        submitLabel: "Create invitation",
      },
    });
    expect(formFieldNames(create)).not.toContain("peerId");
    expect(formField(create, "deliverySubject")).toMatchObject({
      label: "Delivery destination",
      labelBy: {
        field: "deliveryType",
        values: [
          { value: "failing-auto", label: "Automatic address" },
          { value: "manual-test", label: "Manual address" },
        ],
      },
    });

    if (create === null || typeof create !== "object") {
      throw new Error("Expected create control");
    }
    const created = await workspace.actionHandler?.(
      actionRequest(create, {
        idempotencyKey: Reflect.get(
          Reflect.get(create, "input"),
          "idempotencyKey",
        ),
        displayName: "Grace Hopper",
        role: "trusted",
        deliveryType: "manual-test",
        deliverySubject: "grace@example.test",
        deliveryLabel: "Grace",
        deliveryMode: "manual",
      }),
      actor,
    );
    const setupUrl = resultField(created, "setupUrl");
    if (typeof setupUrl !== "string") throw new Error("Expected setup URL");
    expect(setupUrl).toContain("token=");
    expect(resultField(created, "status")).toContain("Manual delivery");

    const afterCreate = await workspace.dataProvider(actor);
    const failingCreate = findAction(afterCreate, "Add a person");
    if (failingCreate === null || typeof failingCreate !== "object") {
      throw new Error("Expected create control");
    }
    const failed = await workspace.actionHandler?.(
      actionRequest(failingCreate, {
        idempotencyKey: Reflect.get(
          Reflect.get(failingCreate, "input"),
          "idempotencyKey",
        ),
        displayName: "Failed Delivery",
        role: "trusted",
        deliveryType: "failing-auto",
        deliverySubject: "failed@example.test",
        deliveryMode: "automatic",
      }),
      actor,
    );
    expect(resultField(failed, "status")).toContain("delivery failed");
    const failedView = await workspace.dataProvider(actor);
    const retry = findAction(failedView, "Retry");
    expect(retry).toBeDefined();
    await workspace.actionHandler?.(actionRequest(retry), actor);

    const pending = await workspace.dataProvider(actor);
    expect(JSON.stringify(pending)).not.toContain(setupUrl);
    expect(findById(pending, "invitations")).toMatchObject({ type: "table" });
    expect(findRowForPerson(pending, "Grace Hopper")).toMatchObject({
      compact: {
        title: "Grace Hopper",
        metadata: ["Trusted", "Grace", expect.any(String)],
        badges: [{ label: expect.any(String) }],
      },
    });
    const confirm = findAction(pending, "Confirm delivered");
    expect(confirm).toBeDefined();
    await workspace.actionHandler?.(actionRequest(confirm), actor);
    expect(
      (await service.listAdminUsers()).find(
        (user) => user.displayName === "Grace Hopper",
      )?.invitation?.state,
    ).toBe("sent");

    const sent = await workspace.dataProvider(actor);
    const resend = findAction(sent, "Resend");
    expect(resend).toBeDefined();
    const resent = await workspace.actionHandler?.(
      actionRequest(resend),
      actor,
    );
    expect(typeof resultField(resent, "setupUrl")).toBe("string");

    const resentView = await workspace.dataProvider(actor);
    const cancel = findAction(
      findRowForPerson(resentView, "Grace Hopper"),
      "Cancel",
    );
    const prepared = await workspace.actionHandler?.(
      actionRequest(cancel, undefined, { mode: "prepare" }),
      actor,
    );
    expect(resultField(prepared, "kind")).toBe("prepared-confirmation");
    const token = resultField(prepared, "token");
    if (typeof token !== "string") throw new Error("Expected cancel token");
    await workspace.actionHandler?.(
      actionRequest(cancel, undefined, { mode: "execute", token }),
      actor,
    );

    const history = await workspace.dataProvider(actor, { state: "history" });
    expect(findById(history, "invitations")).toMatchObject({
      type: "table",
      rows: [
        {
          cells: { person: "Grace Hopper", state: "cancelled" },
        },
      ],
    });
    expect(findAction(history, "Cancel")).toBeUndefined();

    const audit = await service.listAuditEvents();
    for (const action of [
      "auth.invitation.created",
      "auth.invitation.manual_delivery_confirmed",
      "auth.invitation.resent",
      "auth.invitation.cancelled",
    ]) {
      expect(audit.find((event) => event.action === action)?.actorUserId).toBe(
        admin.userId,
      );
    }
  });
});
