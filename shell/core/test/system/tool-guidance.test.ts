import { describe, expect, it } from "bun:test";
import type { Tool } from "@brains/mcp-service";
import { createSystemTools } from "../../src/system/tools";
import { createMockSystemServices } from "./mock-services";
import { generateInputSchema } from "../../src/system/schemas";
import { z } from "@brains/utils/zod";

function description(name: string): string {
  const tool = createSystemTools(createMockSystemServices()).find(
    (candidate: Tool) => candidate.name === name,
  );
  if (!tool) throw new Error(`${name} not found`);
  return tool.description;
}

// The guidance a tool needs travels with the tool: its description reaches
// the model only when the caller can use it, and only once per step.
describe("system tool descriptions carry their own guidance", () => {
  it("system_create: visibility by permission, and same-message content suffices", () => {
    const create = description("system_create");

    expect(create).toContain("Public callers may write only public content");
    expect(create).toContain("ask which scope they mean");
    expect(create).toContain("short sentence or fragment after a colon");
    expect(create).toContain("memo about the launch timeline");
    expect(create).toContain("pasted uploaded-file transcript");
    expect(create).toContain(
      "even when the prior answer says there was limited readable content",
    );
    expect(create).toContain("bare upload receipt");
    expect(create).toContain("image uploads as entityType image");
  });

  it("system_generate: sources, conversions, covers and attachments", () => {
    const generate = description("system_generate");

    expect(generate).toContain(
      "unless the user gives an exact entity id in quotes",
    );
    expect(generate).toContain(
      "Turning an existing entity into another type ('turn my note X into a post') keeps its text and is not generation: call system_create with source.kind entity, also after a search resolves it.",
    );
    expect(generate).toContain("blog posts: entityType post");
    expect(generate).toContain("attachmentType og-image");
    expect(generate).toContain(
      "do not ask whether they mean an existing artifact when the source entity is explicit",
    );
    expect(generate).toContain(
      "quoted id such as deck `distributed-systems-primer`",
    );
    expect(generate).toContain("only after the real artifact ID exists");
    expect(generate).toContain(
      "never use standalone-image as a substitute for a requested cover",
    );
  });

  it("system_generate: says each rule once", () => {
    const generate = description("system_generate");
    const count = (phrase: string): number => generate.split(phrase).length - 1;

    expect(count("in the same turn")).toBeLessThanOrEqual(3);
    expect(count("confirmed")).toBe(1);
  });

  it("system_update: patches, covers and publishing", () => {
    const update = description("system_update");

    expect(update).toContain(
      "Never replace unchanged content with placeholders or ellipses",
    );
    expect(update).toContain(
      "even when ogImageId already points at that image",
    );
    expect(update).toContain("not interchangeable");
    expect(update).toContain(
      "For explicit publish requests, use the publishing tool",
    );
  });

  it("system_delete: protected identity records are updated, not deleted", () => {
    expect(description("system_delete")).toContain(
      "brain-character and anchor-profile cannot be deleted",
    );
  });

  it("system_list: whole-type browsing and summaries", () => {
    const list = description("system_list");

    expect(list).toContain("essays/articles/blog posts => post");
    expect(list).toContain("summarize my blog posts");
  });

  it("system_search: a fresh search for each new question", () => {
    const search = description("system_search");

    expect(search).toContain("run a fresh search for that turn");
    expect(search).toContain("How do I discuss X in my writing?");
  });
});

// The schema says what each field is; the description says when to use
// which operation. Restating the flow in both resent it on every step.
describe("system_generate schema leaves the flow to the description", () => {
  it("keeps its field descriptions short", () => {
    const schema = JSON.stringify(z.toJSONSchema(generateInputSchema));

    expect(schema.length).toBeLessThan(5_500);
    expect(schema).not.toContain("replace:true");
    expect(schema).not.toContain("do not merely say you can generate it");
  });

  it("keeps the prompt voice rule where the prompt is written", () => {
    const schema = JSON.stringify(z.toJSONSchema(generateInputSchema));

    expect(schema).toContain(
      "without added voice, tone or engagement directions",
    );
    expect(description("system_generate")).not.toContain(
      "engagement directions",
    );
  });
});
