import { expect, it, spyOn } from "bun:test";
import { z } from "@brains/utils/zod";
import { defineEntity } from "../src/public/entity-definition";
import { createEntityPackagePlugins } from "../src/entity/declarative-entity-plugin";
import { createPluginHarness } from "../src/test/harness";
import { createOperatorGroupings } from "../src/service/operator-groupings";
import { issueRouteCaller } from "../src/internal/route-caller-authority";

it("counts only admitted visible grouping memberships and bounds usage requests", async () => {
  const h = createPluginHarness();
  const note = defineEntity({
    type: "usage-note",
    purpose: "Usage fixture",
    metadata: z.object({}),
  });
  try {
    for (const plugin of createEntityPackagePlugins(
      [note],
      [],
      { name: "@test/usage", version: "1.0.0" },
      (id) => id,
    ))
      await h.installPlugin(plugin);
    h.getEntityRegistry().registerGrouping({
      key: "labels",
      field: "labels",
      label: "Labels",
      types: [note.type],
    });
    h.addEntities([
      {
        id: "visible",
        entityType: note.type,
        content: "---\nlabels: [A, A, a]\n---\nVisible",
        visibility: "public",
        metadata: {},
      },
      {
        id: "hidden",
        entityType: note.type,
        content: "---\nlabels: [A]\n---\nPRIVATE",
        visibility: "restricted",
        metadata: {},
      },
      {
        id: "empty",
        entityType: note.type,
        content: "No labels",
        visibility: "public",
        metadata: {},
      },
    ]);
    const shell = h.getMockShell();
    const guest = issueRouteCaller(
      { actor: { id: "guest" }, permission: "public", isAnchor: false },
      shell.getAuthRegistry(),
    );
    const admin = issueRouteCaller(
      { actor: { id: "admin" }, permission: "admin", isAnchor: true },
      shell.getAuthRegistry(),
    );
    const capability = createOperatorGroupings(shell);
    const query = spyOn(h.getEntityService(), "queryGroupingUsage");
    const request = {
      grouping: "labels",
      entityTypes: [note.type, "foreign"],
      values: ["A", "a", "missing", "A"],
    };
    Reflect.set(request, "visibilityScope", "restricted");
    expect(await capability.usage(request, guest)).toEqual({
      entries: 1,
      values: [
        { value: "A", count: 1 },
        { value: "a", count: 1 },
        { value: "missing", count: 0 },
        { value: "A", count: 1 },
      ],
    });
    expect(query.mock.calls[0]?.[0]).toMatchObject({
      visibilityScope: "public",
      entityTypes: [note.type],
    });
    expect(await capability.usage(request, admin)).toMatchObject({
      entries: 2,
      values: [
        { value: "A", count: 2 },
        { value: "a", count: 1 },
        { value: "missing", count: 0 },
        { value: "A", count: 2 },
      ],
    });
    const previousCalls = query.mock.calls.length;
    expect(
      await capability
        .usage(request, { ...guest })
        .catch((error: unknown) => error),
    ).toMatchObject({ code: "unauthenticated" });
    expect(
      await capability
        .usage(
          { ...request, values: Array.from({ length: 101 }, () => "A") },
          guest,
        )
        .catch((error: unknown) => error),
    ).toMatchObject({ code: "invalid_input" });
    const controller = new AbortController();
    controller.abort();
    expect(
      await capability
        .usage({ ...request, signal: controller.signal }, guest)
        .catch((error: unknown) => error),
    ).toMatchObject({ code: "cancelled" });
    expect(query.mock.calls.length).toBe(previousCalls);
  } finally {
    await h.reset();
  }
});
