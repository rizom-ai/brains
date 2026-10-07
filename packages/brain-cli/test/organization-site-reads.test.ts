import { expect, spyOn, test } from "bun:test";
import {
  EntityRegistry,
  EntityService,
  scopeEntityReads,
  type SemanticSpaceProjection,
} from "@brains/entity-service";
import { migrateEntities } from "@brains/entity-service/migrate";
import {
  AnchorProfileAdapter,
  anchorProfileSchema,
} from "@brains/identity-service";
import { agent } from "@brains/agent-discovery";
import { buildProximityMapData } from "@brains/agent-discovery/proximity-map-data";
import { askContent } from "@brains/ask-content";
import site from "@brains/site-organization";
import {
  defineServicePlugin,
  instantiatePluginPackageDefinition,
} from "@brains/plugins";
import { createInterfaceAvailabilityWriter } from "@brains/plugins/internal/interface-availability";
import {
  ASK_BOX_AVAILABILITY_OWNER,
  contactFormDiscoveryRequest,
} from "@brains/contracts";
import { createMockShell } from "@brains/plugins/test";
import { createSilentLogger, createTestDirectory } from "@brains/test-utils";
import { z } from "@brains/utils/zod";

test("installed declarative organization source intersects real production/preview and visibility reads", async () => {
  const directory = await createTestDirectory("organization-reads");
  const logger = createSilentLogger();
  const dbConfig = { url: `file:${directory.dir}/entities.db` };
  await migrateEntities(dbConfig, logger);
  const registry = EntityRegistry.createFresh(logger);
  registry.registerEntityType(
    "anchor-profile",
    anchorProfileSchema,
    new AnchorProfileAdapter(),
    { classification: "system" },
  );
  const service = EntityService.createFresh({
    dbConfig,
    embeddingDbConfig: { url: `file:${directory.dir}/embeddings.db` },
    entityRegistry: registry,
    logger,
    jobQueueService: createMockShell().getJobQueueService(),
    embeddingsEnabled: false,
    embeddingService: {
      dimensions: 1536,
      generateEmbedding: async () => {
        throw new Error("Unexpected provider call");
      },
      generateEmbeddings: async () => {
        throw new Error("Unexpected provider call");
      },
    },
  });
  const shell = createMockShell({
    entityService: service,
    domain: "brain.test",
    preferLocalUrls: false,
  });
  shell.getEntityRegistry = (): EntityRegistry => registry;
  const definitions = defineServicePlugin({
    id: "agents",
    config: z.object({}),
    entities: [agent, askContent],
  });
  const plugins = instantiatePluginPackageDefinition(
    definitions,
    {},
    { name: "@brains/agent-discovery", version: "0.0.0" },
  );
  const runtime = site.plugin?.({});
  if (!runtime) throw new Error("Missing organization composition runtime");
  plugins.push(runtime);
  const rows = [
    { id: "public-approved", status: "approved", visibility: "public" },
    { id: "public-draft", status: "discovered", visibility: "public" },
    { id: "shared-approved", status: "approved", visibility: "shared" },
    { id: "private-approved", status: "approved", visibility: "restricted" },
    { id: "archived", status: "archived", visibility: "public" },
    { id: "sighting", status: "discovered", visibility: "public" },
  ] as const;
  // Deliberately overinclusive deterministic projection: no provider/vector acceptance claimed.
  const projection = spyOn(service, "projectSemanticSpace").mockImplementation(
    async (): Promise<SemanticSpaceProjection> => ({
      origin: {
        kind: "entity",
        entityId: "brain-character",
        entityType: "brain-character",
      },
      points: rows.map(({ id }) => ({
        entityId: id,
        entityType: "agent",
        coordinates: [1, 0],
        distanceToOrigin: 0.3,
      })),
      neighbors: [],
      distanceRange: { min: 0.3, max: 0.3 },
    }),
  );
  try {
    for (const plugin of plugins) await plugin.register(shell);
    await service.createEntity({
      entity: {
        entityType: "anchor-profile",
        id: "anchor-profile",
        content: "---\nname: Team\n---\n",
        metadata: {},
        visibility: "public",
      },
    });
    await service.createEntity({
      entity: {
        entityType: "ask-content",
        id: "ask-content",
        content: "---\ntitle: Ask our team\n---\nAn authored opening.\n",
        metadata: {},
        visibility: "public",
      },
    });
    for (const row of rows) {
      const content = `---\nname: ${row.id}\nkind: person\nbrainName: Peer\nurl: https://${row.id}.example\nstatus: ${row.status}\ndiscoveredAt: '2026-03-15T10:00:00.000Z'\n${row.id === "sighting" ? "introducedBy: [public-approved]\n" : ""}---\n\n## About\nPeer.\n`;
      const decoded = service.deserializeEntity(content, "agent");
      await service.createEntity({
        entity: {
          ...decoded,
          entityType: "agent",
          id: row.id,
          visibility: row.visibility,
          content: decoded.content ?? content,
          metadata: decoded.metadata ?? {},
        },
      });
    }
    shell
      .getMessageBus()
      .subscribe(contactFormDiscoveryRequest.topic, async () => ({
        success: true,
        data: {
          origin: "https://brain.test",
          routes: [
            { path: "/contact", method: "GET", public: true, preview: true },
            { path: "/contact", method: "POST", public: true, preview: true },
          ],
        },
      }));
    await createInterfaceAvailabilityWriter(
      shell.getRuntimeState(),
      ASK_BOX_AVAILABILITY_OWNER,
    ).set({ public: false, preview: true });
    const source = shell
      .getDataSourceRegistry()
      .get("@brains/site-organization:homepage");
    if (!source?.fetch) throw new Error("Missing declared homepage source");
    const schema = z.object({
      askBox: z.boolean(),
      opening: z.object({ contactUrl: z.string().nullable() }),
      map: z
        .object({ agents: z.array(z.object({ id: z.string() })) })
        .nullable(),
    });
    for (const publishedOnly of [true, false]) {
      const view = scopeEntityReads(service, {
        publishedOnly,
        visibilityScope: "public",
      });
      expect(
        (await view.listEntities({ entityType: "agent" }))
          .map((entry) => entry.id)
          .sort(),
      ).toEqual(
        publishedOnly
          ? ["public-approved"]
          : ["archived", "public-approved", "public-draft", "sighting"],
      );
      const map = await buildProximityMapData({
        entities: view,
        semantic: { project: (request) => view.projectSemanticSpace(request) },
      });
      expect(map.nodes.some(({ id }) => id === "public-approved")).toBe(true);
      const result = await source.fetch({}, schema, {
        publishedOnly,
        entityService: view,
      });
      expect(result.map?.agents.map(({ id }) => id).sort()).toEqual(
        publishedOnly
          ? ["public-approved"]
          : ["public-approved", "public-draft"],
      );
      expect(result.askBox).toBe(!publishedOnly);
      expect(result.opening.contactUrl).toBe(
        publishedOnly
          ? "https://brain.test/contact"
          : "https://preview.brain.test/contact",
      );
    }
  } finally {
    projection.mockRestore();
    for (const plugin of plugins.reverse()) await plugin.shutdown?.();
    service.close();
    await directory.cleanup();
  }
});
