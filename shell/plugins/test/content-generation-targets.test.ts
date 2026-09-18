import { expect, test } from "bun:test";
import { z } from "@brains/utils/zod";
import { defineEntity } from "../src";
import { createServiceContentTarget } from "../src/service/content-generation-target";

const chapter = defineEntity({
  type: "chapter",
  purpose: "Chapter",
  metadata: z.object({ title: z.string() }),
});
const canGenerate = (name: string): boolean => name === "chapter";

test("checked targets snapshot input and erase definitions", () => {
  const metadata = { title: "Original" };
  const path: [string, ...string[]] = ["book", "intro"];
  const context = { data: { audience: "beginner" } };
  const target = createServiceContentTarget(
    {
      template: "chapter",
      context,
      destination: { entity: chapter, idPath: path, metadata },
    },
    canGenerate,
  );
  metadata.title = "Mutated";
  path[0] = "changed";
  context.data.audience = "changed";
  expect(Object.isFrozen(target)).toBe(true);
  expect(target).toMatchObject({
    templateName: "chapter",
    context: { data: { audience: "beginner" } },
    destination: {
      entityType: "chapter",
      idPath: ["book", "intro"],
      metadata: { title: "Original" },
    },
  });
  expect(JSON.stringify(target)).not.toContain('"entity":');
});

test("metadata is validated by its entity definition exactly once", () => {
  let parses = 0;
  const entity = defineEntity({
    type: "edition",
    purpose: "Edition",
    metadata: z.object({
      edition: z.coerce.number<string>().refine(() => {
        parses++;
        return true;
      }),
    }),
  });
  const target = createServiceContentTarget(
    {
      template: "chapter",
      destination: { entity, idPath: ["edition"], metadata: { edition: "2" } },
    },
    canGenerate,
  );
  expect(target.destination.metadata).toEqual({ edition: 2 });
  expect(parses).toBe(1);
});

test("unknown, format-only and foreign namespace templates are rejected", () => {
  for (const template of ["missing", "formatOnly", "other:chapter"])
    expect(() =>
      createServiceContentTarget(
        {
          template,
          destination: {
            entity: chapter,
            idPath: ["intro"],
            metadata: { title: "Intro" },
          },
        },
        canGenerate,
      ),
    ).toThrow("non-generatable");
});

test("malformed paths and metadata never produce a checked target", () => {
  expect(() =>
    createServiceContentTarget(
      {
        template: "chapter",
        destination: {
          entity: chapter,
          idPath: ["book:intro"],
          metadata: { title: "Intro" },
        },
      },
      canGenerate,
    ),
  ).toThrow();
  expect(() =>
    createServiceContentTarget(
      {
        template: "chapter",
        destination: {
          entity: chapter,
          idPath: ["intro"],
          // @ts-expect-error Exercise invalid runtime metadata without an assertion.
          metadata: { title: 2 },
        },
      },
      canGenerate,
    ),
  ).toThrow();
});
