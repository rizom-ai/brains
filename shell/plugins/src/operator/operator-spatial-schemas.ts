import { z } from "@brains/utils/zod";
import {
  operatorIdentifierSchema as identifierSchema,
  operatorLabelSchema as labelSchema,
  operatorShortTextSchema as shortTextSchema,
  operatorTextSchema as textSchema,
  operatorToneSchema as toneSchema,
  operatorCoordinateSchema as coordinateSchema,
} from "./operator-view-contract";
import type { RuntimeOperatorSpatialBlock } from "./operator-view-runtime-types";

const spatialLegendItemSchema = z
  .object({ label: labelSchema, tone: toneSchema.optional() })
  .strict();
const spatialRelationshipSchema = z
  .object({
    sourceId: identifierSchema,
    targetId: identifierSchema,
    label: labelSchema.optional(),
    tone: toneSchema.optional(),
  })
  .strict();
const cartesianPointSchema = z
  .object({
    id: identifierSchema,
    label: labelSchema,
    category: labelSchema,
    x: coordinateSchema,
    y: coordinateSchema,
    zoneId: identifierSchema.optional(),
    tone: toneSchema.optional(),
    details: z.array(shortTextSchema).max(20).optional(),
  })
  .strict();
const cartesianZoneSchema = z
  .object({
    id: identifierSchema,
    label: labelSchema,
    x: coordinateSchema,
    y: coordinateSchema,
    memberIds: z.array(identifierSchema).max(500),
  })
  .strict();
const cartesianSpatialBlockSchema = z
  .object({
    type: z.literal("spatial"),
    layout: z.literal("cartesian"),
    id: identifierSchema,
    label: labelSchema,
    description: textSchema,
    points: z.array(cartesianPointSchema).max(500),
    zones: z.array(cartesianZoneSchema).max(100),
    relationships: z.array(spatialRelationshipSchema).max(2_000).optional(),
    legend: z.array(spatialLegendItemSchema).max(20),
  })
  .strict()
  .superRefine((block, context) => {
    const pointIds = new Set<string>();
    for (const [index, point] of block.points.entries()) {
      if (pointIds.has(point.id)) {
        context.addIssue({
          code: "custom",
          message: `Spatial point id "${point.id}" is duplicated`,
          path: ["points", index, "id"],
        });
      }
      pointIds.add(point.id);
    }
    const zoneIds = new Set<string>();
    for (const [index, zone] of block.zones.entries()) {
      if (zoneIds.has(zone.id) || pointIds.has(zone.id)) {
        context.addIssue({
          code: "custom",
          message: `Spatial zone id "${zone.id}" is duplicated`,
          path: ["zones", index, "id"],
        });
      }
      zoneIds.add(zone.id);
      for (const memberId of zone.memberIds) {
        if (!pointIds.has(memberId)) {
          context.addIssue({
            code: "custom",
            message: `Spatial zone member "${memberId}" has no matching point`,
            path: ["zones", index, "memberIds"],
          });
        }
      }
    }
    for (const [index, point] of block.points.entries()) {
      if (point.zoneId && !zoneIds.has(point.zoneId)) {
        context.addIssue({
          code: "custom",
          message: `Spatial point zone "${point.zoneId}" has no matching zone`,
          path: ["points", index, "zoneId"],
        });
      }
    }
    const nodeIds = new Set([...pointIds, ...zoneIds]);
    for (const [index, relationship] of (block.relationships ?? []).entries()) {
      if (
        !nodeIds.has(relationship.sourceId) ||
        !nodeIds.has(relationship.targetId)
      ) {
        context.addIssue({
          code: "custom",
          message:
            "Spatial relationship endpoints must reference declared points or zones",
          path: ["relationships", index],
        });
      }
    }
  });

const radialPointSchema = z
  .object({
    id: identifierSchema,
    label: labelSchema,
    kind: labelSchema,
    status: labelSchema,
    tags: z.array(labelSchema).max(30).optional(),
    distance: coordinateSchema,
    bearing: z.number().finite().min(0).lt(360),
    relatedIds: z.array(identifierSchema).max(100).optional(),
    tone: toneSchema.optional(),
    details: z.array(shortTextSchema).max(20).optional(),
  })
  .strict();
const spatialClusterSchema = z
  .object({
    id: identifierSchema,
    label: labelSchema,
    memberIds: z.array(identifierSchema).min(2).max(500),
  })
  .strict();
const radialStratumSchema = z
  .object({
    id: identifierSchema,
    label: labelSchema,
    maxDistance: coordinateSchema,
  })
  .strict();
const radialSpatialBlockSchema = z
  .object({
    type: z.literal("spatial"),
    layout: z.literal("radial"),
    id: identifierSchema,
    label: labelSchema,
    description: textSchema,
    centerLabel: labelSchema,
    centerKind: z.enum(["identity", "centroid"]),
    points: z.array(radialPointSchema).max(500),
    clusters: z.array(spatialClusterSchema).max(100).optional(),
    relationships: z.array(spatialRelationshipSchema).max(2_000).optional(),
    strata: z.array(radialStratumSchema).min(1).max(10),
    legend: z.array(spatialLegendItemSchema).max(20),
  })
  .strict()
  .superRefine((block, context) => {
    const pointIds = new Set<string>();
    for (const [index, point] of block.points.entries()) {
      if (pointIds.has(point.id)) {
        context.addIssue({
          code: "custom",
          message: `Spatial point id "${point.id}" is duplicated`,
          path: ["points", index, "id"],
        });
      }
      pointIds.add(point.id);
    }
    for (const [index, point] of block.points.entries()) {
      for (const relatedId of point.relatedIds ?? []) {
        if (!pointIds.has(relatedId)) {
          context.addIssue({
            code: "custom",
            message: `Related point "${relatedId}" is not declared`,
            path: ["points", index, "relatedIds"],
          });
        }
      }
    }
    const clusterIds = new Set<string>();
    for (const [index, cluster] of (block.clusters ?? []).entries()) {
      if (clusterIds.has(cluster.id)) {
        context.addIssue({
          code: "custom",
          message: `Spatial cluster id "${cluster.id}" is duplicated`,
          path: ["clusters", index, "id"],
        });
      }
      clusterIds.add(cluster.id);
      for (const memberId of cluster.memberIds) {
        if (!pointIds.has(memberId)) {
          context.addIssue({
            code: "custom",
            message: `Spatial cluster member "${memberId}" has no matching point`,
            path: ["clusters", index, "memberIds"],
          });
        }
      }
    }
    for (const [index, relationship] of (block.relationships ?? []).entries()) {
      if (
        !pointIds.has(relationship.sourceId) ||
        !pointIds.has(relationship.targetId)
      ) {
        context.addIssue({
          code: "custom",
          message:
            "Spatial relationship endpoints must reference declared points",
          path: ["relationships", index],
        });
      }
    }
    let previous = -1;
    for (const [index, stratum] of block.strata.entries()) {
      if (stratum.maxDistance <= previous) {
        context.addIssue({
          code: "custom",
          message: "Radial strata must increase by maximum distance",
          path: ["strata", index, "maxDistance"],
        });
      }
      previous = stratum.maxDistance;
    }
  });
export const spatialBlockSchema: z.ZodType<
  RuntimeOperatorSpatialBlock,
  unknown
> = z.discriminatedUnion("layout", [
  cartesianSpatialBlockSchema,
  radialSpatialBlockSchema,
]);
