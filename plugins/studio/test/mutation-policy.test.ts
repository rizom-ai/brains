import {
  recordConflictContract,
  recordConflictRequestSchema,
  resolveConflictContract,
  resolveConflictRequestSchema,
  type RecordConflictRequest,
  type ResolveConflictRequest,
} from "@brains/contracts";
import type { AuthPrincipal } from "@brains/contracts";
import { createMockShell, type MockShell } from "@brains/plugins/test";
import { describe, expect, it } from "bun:test";
import type { BaseEntity, WebRouteDefinition } from "@brains/plugins";
import { BaseEntityAdapter, baseEntitySchema } from "@brains/plugins";
import { PermissionService } from "@brains/templates";

import { z } from "@brains/utils/zod";
import { createEditorRoutes } from "../src/editor-routes";
import { StudioWorkspaceRegistry } from "../src/workspace-registry";
import { studioContextOn } from "./studio-plugins";

const mutationFrontmatterSchema = z.object({
  title: z.string(),
  status: z.enum(["draft", "published"]).optional(),
});

type MutationFrontmatter = z.infer<typeof mutationFrontmatterSchema>;

class MutationFixtureAdapter extends BaseEntityAdapter<
  BaseEntity,
  Record<string, unknown>,
  MutationFrontmatter
> {
  constructor(entityType: string) {
    super({
      entityType,
      purpose: `${entityType} Studio mutation policy fixtures`,
      schema: baseEntitySchema,
      frontmatterSchema: mutationFrontmatterSchema,
    });
  }

  public fromMarkdown(markdown: string): Partial<BaseEntity> {
    const frontmatter = this.parseFrontmatter(markdown);
    return {
      entityType: this.entityType,
      content: markdown,
      metadata:
        this.entityType === "smuggle"
          ? { ...frontmatter, visibility: "restricted" }
          : frontmatter,
      ...(this.entityType === "smuggle" ? { visibility: "restricted" } : {}),
    };
  }
}

type FixturePermissionLevel = "public" | "trusted" | "admin";

const principalFor = (
  permissionLevel: FixturePermissionLevel,
): AuthPrincipal => ({
  userId: `usr_${permissionLevel}`,
  personId: `person_${permissionLevel}`,
  displayName: `${permissionLevel} editor`,
  role: permissionLevel,
  status: "active",
  permissionLevel,
  isAnchor: permissionLevel === "admin",
});

function fixtureEntity(input: {
  id: string;
  entityType?: string;
  status?: "draft" | "published";
  visibility: BaseEntity["visibility"];
}): BaseEntity {
  const entityType = input.entityType ?? "post";
  const metadata = {
    title: input.id,
    ...(input.status ? { status: input.status } : {}),
  };
  const statusLine = input.status ? `status: ${input.status}\n` : "";
  return {
    id: input.id,
    entityType,
    content:
      `---\ntitle: ${input.id}\n${statusLine}` +
      `visibility: ${input.visibility}\n---\n\n${input.id} body\n`,
    metadata,
    visibility: input.visibility,
    contentHash: `${input.id}-hash`,
    created: "2026-07-01T00:00:00.000Z",
    updated: "2026-07-01T00:00:00.000Z",
  };
}

async function createMutationFixture(
  permissionLevel: FixturePermissionLevel = "trusted",
): Promise<{
  shell: MockShell;
  routes: WebRouteDefinition[];
  setPermissionLevel: (level: FixturePermissionLevel) => void;
  permissionService: PermissionService;
}> {
  const shell = createMockShell({ domain: "yeehaa.io" });
  const registry = shell.getEntityRegistry();
  for (const entityType of ["post", "secret", "never-note", "smuggle"]) {
    registry.registerEntityType(
      entityType,
      baseEntitySchema,
      new MutationFixtureAdapter(entityType),
      entityType === "post"
        ? { publish: { publishStatuses: ["published"] } }
        : {},
    );
  }
  registry.getEffectiveFrontmatterSchema = (
    entityType,
  ): typeof mutationFrontmatterSchema | undefined =>
    ["post", "secret", "never-note", "smuggle"].includes(entityType)
      ? mutationFrontmatterSchema
      : undefined;

  shell.addEntities([
    fixtureEntity({
      id: "shared-draft",
      status: "draft",
      visibility: "shared",
    }),
    fixtureEntity({
      id: "published-post",
      status: "published",
      visibility: "shared",
    }),
    fixtureEntity({
      id: "restricted-draft",
      status: "draft",
      visibility: "restricted",
    }),
    fixtureEntity({
      id: "never-note",
      entityType: "never-note",
      visibility: "restricted",
    }),
  ]);

  const permissionService = new PermissionService({
    entityActions: {
      "*": {
        create: "admin",
        update: "admin",
        delete: "admin",
        extract: "never",
        publish: "admin",
      },
      post: { create: "trusted", update: "trusted" },
      smuggle: { create: "trusted", update: "trusted" },
      "never-note": {
        create: "never",
        update: "never",
        delete: "never",
        publish: "never",
      },
    },
  });
  shell.getPermissionService = (): PermissionService => permissionService;

  let activePermissionLevel = permissionLevel;
  const context = await studioContextOn(shell);
  const routes = createEditorRoutes({
    routePath: "/studio",
    getContext: () => context,
    resolveAuthPrincipal: async (): Promise<AuthPrincipal> =>
      principalFor(activePermissionLevel),
    getEntityDisplay: () => undefined,
    workspaceRegistry: new StudioWorkspaceRegistry(),
  });
  return {
    shell,
    routes,
    setPermissionLevel: (level): void => {
      activePermissionLevel = level;
    },
    permissionService,
  };
}

function findRoute(
  routes: WebRouteDefinition[],
  method: "POST" | "PUT" | "DELETE",
  path = "/studio/api/entities",
): WebRouteDefinition {
  const route = routes.find(
    (candidate) => candidate.path === path && candidate.method === method,
  );
  if (!route) throw new Error(`Missing ${method} ${path} route`);
  return route;
}

function mutationRequest(
  path: string,
  method: "POST" | "PUT" | "DELETE",
  body: unknown,
  options: {
    origin?: string | null;
    contentType?: string;
  } = {},
): Request {
  const origin =
    options.origin === undefined ? "https://yeehaa.io" : options.origin;
  return new Request(`https://yeehaa.io${path}`, {
    method,
    headers: {
      ...(origin === null ? {} : { Origin: origin }),
      "Content-Type": options.contentType ?? "application/json",
    },
    body: JSON.stringify(body),
  });
}

function createPayload(input: {
  entityType: string;
  title: string;
  visibility: "public" | "shared" | "restricted";
}): Record<string, unknown> {
  return {
    entityType: input.entityType,
    frontmatter: {
      title: input.title,
      status: "draft",
      visibility: input.visibility,
    },
    body: `${input.title} body`,
  };
}

function updatePayload(input: {
  id: string;
  status: "draft" | "published";
  visibility?: "public" | "shared" | "restricted";
  /** The version the edit started from; the fixture's own when not given. */
  baseContentHash?: string;
}): Record<string, unknown> {
  return {
    entityType: "post",
    id: input.id,
    frontmatter: {
      title: `${input.id} updated`,
      status: input.status,
      visibility: input.visibility ?? "shared",
    },
    body: `${input.id} updated body`,
    baseContentHash: input.baseContentHash ?? `${input.id}-hash`,
  };
}

describe("Studio entity mutation policy", () => {
  it("honours wildcard defaults, type overrides, and never for creates", async () => {
    const trusted = await createMutationFixture("trusted");
    const trustedCreate = findRoute(trusted.routes, "POST");

    const allowed = await trustedCreate.handler(
      mutationRequest(
        "/studio/api/entities",
        "POST",
        createPayload({
          entityType: "post",
          title: "Shared collaboration",
          visibility: "shared",
        }),
      ),
    );
    const wildcardDenied = await trustedCreate.handler(
      mutationRequest(
        "/studio/api/entities",
        "POST",
        createPayload({
          entityType: "secret",
          title: "Admin machinery",
          visibility: "shared",
        }),
      ),
    );

    const admin = await createMutationFixture("admin");
    const neverDenied = await findRoute(admin.routes, "POST").handler(
      mutationRequest(
        "/studio/api/entities",
        "POST",
        createPayload({
          entityType: "never-note",
          title: "Never",
          visibility: "restricted",
        }),
      ),
    );

    expect(allowed.status).toBe(201);
    const allowedEntityId = z
      .object({ entityId: z.string() })
      .parse(await allowed.json()).entityId;
    expect(
      (
        await trusted.shell.getEntityService().getEntity({
          visibilityScope: "restricted",
          entityType: "post",
          id: allowedEntityId,
        })
      )?.visibility,
    ).toBe("shared");
    expect(wildcardDenied.status).toBe(403);
    expect(neverDenied.status).toBe(403);
    expect(
      await trusted.shell.getEntityService().listEntities({
        entityType: "post",
        options: { filter: { visibilityScope: "shared" } },
      }),
    ).toHaveLength(3);
  });

  it("caps adapter-derived visibility and hides unreadable mutation targets", async () => {
    const { shell, routes } = await createMutationFixture("trusted");
    const createRoute = findRoute(routes, "POST");
    const updateRoute = findRoute(routes, "PUT");

    const restrictedCreate = await createRoute.handler(
      mutationRequest(
        "/studio/api/entities",
        "POST",
        createPayload({
          entityType: "post",
          title: "Restricted create",
          visibility: "restricted",
        }),
      ),
    );
    const restrictedUpdate = await updateRoute.handler(
      mutationRequest(
        "/studio/api/entities",
        "PUT",
        updatePayload({
          id: "shared-draft",
          status: "draft",
          visibility: "restricted",
        }),
      ),
    );
    const unreadableUpdate = await updateRoute.handler(
      mutationRequest(
        "/studio/api/entities",
        "PUT",
        updatePayload({ id: "restricted-draft", status: "draft" }),
      ),
    );
    const invalidVisibility = await createRoute.handler(
      mutationRequest("/studio/api/entities", "POST", {
        entityType: "post",
        frontmatter: {
          title: "Invalid visibility",
          status: "draft",
          visibility: "classified",
        },
        body: "Invalid visibility body",
      }),
    );
    const adapterSmuggle = await createRoute.handler(
      mutationRequest(
        "/studio/api/entities",
        "POST",
        createPayload({
          entityType: "smuggle",
          title: "Adapter smuggle",
          visibility: "shared",
        }),
      ),
    );

    expect(restrictedCreate.status).toBe(403);
    expect(restrictedUpdate.status).toBe(403);
    expect(unreadableUpdate.status).toBe(404);
    expect(invalidVisibility.status).toBe(400);
    expect(adapterSmuggle.status).toBe(201);
    const smuggledId = z
      .object({ entityId: z.string() })
      .parse(await adapterSmuggle.json()).entityId;
    const smuggledEntity = await shell.getEntityService().getEntity({
      visibilityScope: "restricted",
      entityType: "smuggle",
      id: smuggledId,
    });
    expect(smuggledEntity?.visibility).toBe("shared");
    expect(smuggledEntity?.metadata["visibility"]).toBeUndefined();
    expect(
      (
        await shell.getEntityService().getEntity({
          visibilityScope: "restricted",
          entityType: "post",
          id: "shared-draft",
        })
      )?.visibility,
    ).toBe("shared");
  });

  it("requires publish permission when entering or remaining published", async () => {
    const trusted = await createMutationFixture("trusted");
    const route = findRoute(trusted.routes, "PUT");

    const draftEdit = await route.handler(
      mutationRequest(
        "/studio/api/entities",
        "PUT",
        updatePayload({ id: "shared-draft", status: "draft" }),
      ),
    );
    const publish = await route.handler(
      mutationRequest(
        "/studio/api/entities",
        "PUT",
        updatePayload({ id: "shared-draft", status: "published" }),
      ),
    );
    const publishedEdit = await route.handler(
      mutationRequest(
        "/studio/api/entities",
        "PUT",
        updatePayload({ id: "published-post", status: "published" }),
      ),
    );

    const admin = await createMutationFixture("admin");
    const adminPublish = await findRoute(admin.routes, "PUT").handler(
      mutationRequest(
        "/studio/api/entities",
        "PUT",
        updatePayload({ id: "shared-draft", status: "published" }),
      ),
    );

    expect(draftEdit.status).toBe(200);
    expect(publish.status).toBe(403);
    expect(publishedEdit.status).toBe(403);
    expect(adminPublish.status).toBe(200);
  });

  describe("a save that publishes", () => {
    /** An admin's save of the shared draft, and the actions it was checked for. */
    async function publishing(
      payload: Record<string, unknown>,
      refuseUpdate = false,
    ): Promise<{ status: number; checked: string[] }> {
      const fixture = await createMutationFixture("admin");
      const assertAllowed =
        fixture.permissionService.assertEntityActionAllowed.bind(
          fixture.permissionService,
        );
      const checked: string[] = [];
      fixture.permissionService.assertEntityActionAllowed = (
        entityType,
        action,
        userLevel,
      ): void => {
        checked.push(action);
        // A type its owner publishes and nobody edits.
        if (refuseUpdate && action === "update")
          throw new Error("Updating `post` is not allowed");
        assertAllowed(entityType, action, userLevel);
      };
      const response = await findRoute(fixture.routes, "PUT").handler(
        mutationRequest("/studio/api/entities", "PUT", payload),
      );
      return { status: response.status, checked: [...new Set(checked)] };
    }

    /** The shared draft as stored, with its status alone set to published. */
    const asItStands = {
      entityType: "post",
      id: "shared-draft",
      frontmatter: {
        title: "shared-draft",
        status: "published",
        visibility: "shared",
      },
      body: "shared-draft body",
      baseContentHash: "shared-draft-hash",
    };

    it("needs publish alone when it changes nothing else", async () => {
      expect(await publishing(asItStands, true)).toEqual({
        status: 200,
        checked: ["publish"],
      });
    });

    it("needs update as well when it changes the body or another field", async () => {
      for (const payload of [
        { ...asItStands, body: "Another body" },
        {
          ...asItStands,
          frontmatter: { ...asItStands.frontmatter, title: "Edited" },
        },
      ]) {
        expect(await publishing(payload)).toEqual({
          status: 200,
          checked: ["publish", "update"],
        });
        expect((await publishing(payload, true)).status).toBe(403);
      }
    });
  });

  it("rechecks action policy immediately before persistence", async () => {
    const fixture = await createMutationFixture("trusted");
    const assertAllowed =
      fixture.permissionService.assertEntityActionAllowed.bind(
        fixture.permissionService,
      );
    let updateChecks = 0;
    fixture.permissionService.assertEntityActionAllowed = (
      entityType,
      action,
      userLevel,
    ): void => {
      assertAllowed(entityType, action, userLevel);
      if (entityType === "post" && action === "update") {
        updateChecks += 1;
        if (updateChecks === 2) throw new Error("Policy changed before write");
      }
    };

    const response = await findRoute(fixture.routes, "PUT").handler(
      mutationRequest(
        "/studio/api/entities",
        "PUT",
        updatePayload({ id: "shared-draft", status: "draft" }),
      ),
    );

    expect(response.status).toBe(403);
    expect(updateChecks).toBe(2);
    expect(
      (
        await fixture.shell.getEntityService().getEntity({
          visibilityScope: "restricted",
          entityType: "post",
          id: "shared-draft",
        })
      )?.content,
    ).toContain("shared-draft body");
  });

  describe("a save over a newer version", () => {
    /** The conflict service, answering on the bus as the real one does. */
    function keepConflicts(shell: MockShell): RecordConflictRequest[] {
      const kept: RecordConflictRequest[] = [];
      shell
        .getMessageBus()
        .subscribe(recordConflictContract.name, async (message) => {
          kept.push(recordConflictRequestSchema.parse(message.payload));
          return {
            success: true,
            data: {
              conflictId: "post:shared-draft:20261118T102030Z",
              created: true,
            },
          };
        });
      return kept;
    }
    const save = async (
      routes: WebRouteDefinition[],
      baseContentHash?: string,
    ): Promise<{ status: number; body: Record<string, unknown> }> => {
      const response = await findRoute(routes, "PUT").handler(
        mutationRequest(
          "/studio/api/entities",
          "PUT",
          baseContentHash === undefined
            ? withoutBase(
                updatePayload({ id: "shared-draft", status: "draft" }),
              )
            : updatePayload({
                id: "shared-draft",
                status: "draft",
                baseContentHash,
              }),
        ),
      );
      return {
        status: response.status,
        body: z.record(z.string(), z.unknown()).parse(await response.json()),
      };
    };
    const withoutBase = ({
      baseContentHash: _base,
      ...payload
    }: Record<string, unknown>): Record<string, unknown> => payload;
    const current = async (shell: MockShell): Promise<BaseEntity> => {
      const entity = await shell.getEntityService().getEntity({
        visibilityScope: "restricted",
        entityType: "post",
        id: "shared-draft",
      });
      if (!entity) throw new Error("No shared draft");
      return entity;
    };

    it("refuses a save that does not name the version it edited", async () => {
      const { routes, shell } = await createMutationFixture("trusted");
      const kept = keepConflicts(shell);

      const { status } = await save(routes);

      expect(status).toBe(400);
      expect(kept).toEqual([]);
      expect((await current(shell)).content).toContain("shared-draft body");
    });

    it("keeps a stale save as a conflict and names it in the 409", async () => {
      const { routes, shell } = await createMutationFixture("trusted");
      const kept = keepConflicts(shell);
      const before = await current(shell);

      const { status, body } = await save(routes, "stale-hash");

      expect(status).toBe(409);
      expect(body).toMatchObject({
        conflictId: "post:shared-draft:20261118T102030Z",
        currentContentHash: before.contentHash,
      });
      expect(kept).toHaveLength(1);
      expect(kept[0]).toMatchObject({
        entityType: "post",
        entityId: "shared-draft",
        origin: "studio",
        actor: "usr_trusted",
        base: "stale-hash",
        current: before.contentHash,
        targetVisibility: "shared",
      });
      expect(kept[0]?.text).toContain("shared-draft updated body");
      expect((await current(shell)).content).toBe(before.content);
    });

    it("keeps a save that another writer overtook between the check and the write", async () => {
      const { routes, shell } = await createMutationFixture("trusted");
      const kept = keepConflicts(shell);
      const before = await current(shell);
      const service = shell.getEntityService();
      const options: Array<string | undefined> = [];
      service.updateEntity = async (
        request,
      ): ReturnType<typeof service.updateEntity> => {
        options.push(request.options?.expectedContentHash);
        return {
          entityId: request.entity.id,
          jobId: "",
          skipped: true,
          skipReason: "content-conflict" as const,
        };
      };

      const { status, body } = await save(routes, before.contentHash);

      // The write names the version the editor opened: check and write are one.
      expect(options).toEqual([before.contentHash]);
      expect(status).toBe(409);
      expect(body["conflictId"]).toBe("post:shared-draft:20261118T102030Z");
      expect(kept).toHaveLength(1);
    });

    it("still answers 409 when nothing can hold the conflict", async () => {
      const { routes } = await createMutationFixture("trusted");

      const { status, body } = await save(routes, "stale-hash");

      expect(status).toBe(409);
      expect(body["conflictId"]).toBeUndefined();
    });

    it("saves over the version the editor opened", async () => {
      const { routes, shell } = await createMutationFixture("trusted");
      const kept = keepConflicts(shell);

      const { status } = await save(routes, (await current(shell)).contentHash);

      expect(status).toBe(200);
      expect(kept).toEqual([]);
      expect((await current(shell)).content).toContain(
        "shared-draft updated body",
      );
    });
  });

  describe("resolving a conflict from the editor", () => {
    const CONFLICT = "post:shared-draft:20261118T102030Z";
    /** The conflict service: it settles only the caller's own conflict. */
    function resolveConflicts(shell: MockShell): ResolveConflictRequest[] {
      const asked: ResolveConflictRequest[] = [];
      shell
        .getMessageBus()
        .subscribe(resolveConflictContract.name, async (message) => {
          const request = resolveConflictRequestSchema.parse(message.payload);
          asked.push(request);
          if (request.userId !== "usr_trusted") {
            // A refusal, as the bus carries one.
            return {
              success: false,
              error:
                "Only the person whose edit this is, or an admin, can resolve it",
            };
          }
          return { success: true, data: { resolved: true } };
        });
      return asked;
    }
    const resolve = (
      routes: WebRouteDefinition[],
      body: Record<string, unknown>,
    ): Response | Promise<Response> =>
      findRoute(routes, "POST", "/studio/api/conflicts").handler(
        mutationRequest("/studio/api/conflicts", "POST", body),
      );

    it("asks the conflict service as the signed-in person", async () => {
      const { routes, shell } = await createMutationFixture("trusted");
      const asked = resolveConflicts(shell);

      const response = await resolve(routes, {
        conflictId: CONFLICT,
        action: "apply",
      });

      expect(response.status).toBe(200);
      expect(asked).toEqual([
        {
          conflictId: CONFLICT,
          action: "apply",
          userId: "usr_trusted",
          permissionLevel: "trusted",
        },
      ]);
    });

    it("passes on a refusal, and says so when nothing keeps conflicts", async () => {
      const admin = await createMutationFixture("admin");
      resolveConflicts(admin.shell);
      const refused = await resolve(admin.routes, {
        conflictId: CONFLICT,
        action: "keep-current",
      });
      expect(refused.status).toBe(409);

      const bare = await createMutationFixture("trusted");
      const unavailable = await resolve(bare.routes, {
        conflictId: CONFLICT,
        action: "keep-current",
      });
      expect(unavailable.status).toBe(503);
    });

    it("refuses a request that names no conflict or an unknown action", async () => {
      const { routes, shell } = await createMutationFixture("trusted");
      const asked = resolveConflicts(shell);

      expect((await resolve(routes, { action: "apply" })).status).toBe(400);
      expect(
        (await resolve(routes, { conflictId: CONFLICT, action: "delete" }))
          .status,
      ).toBe(400);
      expect(asked).toEqual([]);
    });
  });

  it("re-resolves changed roles and enforces wildcard delete policy", async () => {
    const fixture = await createMutationFixture("trusted");
    const deleteRoute = findRoute(fixture.routes, "DELETE");

    const trustedDelete = await deleteRoute.handler(
      mutationRequest(
        "/studio/api/entities?type=post&id=shared-draft",
        "DELETE",
        {
          confirmed: true,
        },
      ),
    );
    fixture.setPermissionLevel("public");
    const afterDemotion = await findRoute(fixture.routes, "PUT").handler(
      mutationRequest(
        "/studio/api/entities",
        "PUT",
        updatePayload({ id: "shared-draft", status: "draft" }),
      ),
    );

    expect(trustedDelete.status).toBe(403);
    expect(afterDemotion.status).toBe(403);
    expect(
      await fixture.shell.getEntityService().getEntity({
        visibilityScope: "restricted",
        entityType: "post",
        id: "shared-draft",
      }),
    ).not.toBeNull();
  });

  it("requires same-origin JSON and explicit delete confirmation", async () => {
    const admin = await createMutationFixture("admin");
    const createRoute = findRoute(admin.routes, "POST");
    const deleteRoute = findRoute(admin.routes, "DELETE");

    const missingOrigin = await createRoute.handler(
      mutationRequest(
        "/studio/api/entities",
        "POST",
        createPayload({
          entityType: "post",
          title: "Missing origin",
          visibility: "restricted",
        }),
        { origin: null },
      ),
    );
    const crossOrigin = await createRoute.handler(
      mutationRequest(
        "/studio/api/entities",
        "POST",
        createPayload({
          entityType: "post",
          title: "Cross origin",
          visibility: "restricted",
        }),
        { origin: "https://evil.example.com" },
      ),
    );
    const nonJson = await createRoute.handler(
      mutationRequest(
        "/studio/api/entities",
        "POST",
        createPayload({
          entityType: "post",
          title: "Wrong content type",
          visibility: "restricted",
        }),
        { contentType: "text/plain" },
      ),
    );
    const unconfirmed = await deleteRoute.handler(
      mutationRequest(
        "/studio/api/entities?type=post&id=shared-draft",
        "DELETE",
        {
          confirmed: false,
        },
      ),
    );
    const confirmed = await deleteRoute.handler(
      mutationRequest(
        "/studio/api/entities?type=post&id=shared-draft",
        "DELETE",
        {
          confirmed: true,
        },
      ),
    );
    const neverDelete = await deleteRoute.handler(
      mutationRequest(
        "/studio/api/entities?type=never-note&id=never-note",
        "DELETE",
        { confirmed: true },
      ),
    );

    expect(missingOrigin.status).toBe(403);
    expect(crossOrigin.status).toBe(403);
    expect(nonJson.status).toBe(415);
    expect(unconfirmed.status).toBe(400);
    expect(confirmed.status).toBe(200);
    expect(neverDelete.status).toBe(403);
  });
});
