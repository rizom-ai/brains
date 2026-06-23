import { describe, it, expect } from "bun:test";
import { buildInstructions } from "../src/brain-instructions";

const identity = {
  name: "Rover",
  role: "Knowledge assistant",
  purpose: "Help organize knowledge",
  values: ["clarity"],
};

describe("buildInstructions", () => {
  it("should include identity in system prompt", () => {
    const instructions = buildInstructions(identity, "anchor");
    expect(instructions).toContain("# Rover");
    expect(instructions).toContain("Knowledge assistant");
    expect(instructions).toContain("Help organize knowledge");
    expect(instructions).toContain("clarity");
  });

  it("should include profile when provided", () => {
    const instructions = buildInstructions(identity, "anchor", undefined, {
      name: "Jan Hein",
      kind: "professional",
      email: "jan@yeehaa.io",
      website: "https://yeehaa.io",
      description: "Builder of brains",
    });
    expect(instructions).toContain("Your Anchor");
    expect(instructions).toContain("Jan Hein");
    expect(instructions).toContain("jan@yeehaa.io");
    expect(instructions).toContain("https://yeehaa.io");
    expect(instructions).toContain("Builder of brains");
  });

  it("should not include profile section when profile is undefined", () => {
    const instructions = buildInstructions(identity, "anchor");
    expect(instructions).not.toContain("## Your Anchor");
  });

  it("should not reference system_get-identity or system_get-profile tools", () => {
    const instructions = buildInstructions(identity, "anchor", undefined, {
      name: "Jan Hein",
      kind: "professional" as const,
      description: "Builder",
    });
    expect(instructions).not.toContain("system_get-identity");
    expect(instructions).not.toContain("system_get-profile");
  });

  it("should describe anchor permission as authorization, not profile identity", () => {
    const instructions = buildInstructions(identity, "anchor", undefined, {
      name: "Jan Hein",
      kind: "professional" as const,
      description: "Builder",
    });
    expect(instructions).toContain("Jan Hein");
    expect(instructions).toContain("anchor-level operator permissions");
    expect(instructions).toContain(
      "does not prove the caller's real-world identity or profile name",
    );
    expect(instructions).not.toContain(
      "You are speaking with your ANCHOR (Jan Hein)",
    );
  });

  it("should tell public users they are not the anchor and cannot mutate content", () => {
    const instructions = buildInstructions(identity, "public");
    expect(instructions).toContain("public user");
    expect(instructions).toContain("Public users are not the anchor");
    expect(instructions).toContain("generally cannot create, update, delete");
    expect(instructions).toContain(
      "Do not name, volunteer, or disclose the configured anchor/profile identity in that answer",
    );
    expect(instructions).toContain(
      "Do not confirm, deny, reveal, or compare against the configured profile details unless the user separately asks who owns the brain.",
    );
  });

  it("should not disclose profile identity when answering whether caller is anchor", () => {
    const instructions = buildInstructions(identity, "public", undefined, {
      name: "Jan Hein",
      kind: "professional" as const,
    });
    expect(instructions).toContain(
      "Do not name, volunteer, or disclose the configured anchor/profile identity in that answer",
    );
    expect(instructions).toContain(
      "Do not confirm, deny, reveal, or compare against the configured profile details",
    );
  });

  it("should show trusted user context for trusted users", () => {
    const instructions = buildInstructions(identity, "trusted");
    expect(instructions).toContain("trusted user");
  });

  it("should show public user context for public users", () => {
    const instructions = buildInstructions(identity, "public");
    expect(instructions).toContain("public user");
  });

  it("should map note-like language to the note entity type", () => {
    const instructions = buildInstructions(identity, "anchor");
    expect(instructions).toContain(
      '"note", "notes", "memo" → entityType: `note`',
    );
    expect(instructions).not.toContain('"note", "memo" → entityType: `note`');
    expect(instructions).toContain(
      'When they ask for a type **about** a topic (for example "notes about TypeScript"), use one `system_search` scoped to that entity type/topic',
    );
  });

  it("should keep default shell instructions brain-neutral", () => {
    const instructions = buildInstructions(identity, "anchor");
    expect(instructions).toContain("managing a knowledge system");
    expect(instructions).not.toContain("personal knowledge system");
    expect(instructions).not.toContain(
      '"blog post", "post", "essay", "article"',
    );
    expect(instructions).not.toContain(
      '"case study", "portfolio piece", "project"',
    );
  });

  it("should append brain-specific instructions separately from plugin instructions", () => {
    const instructions = buildInstructions(
      identity,
      "anchor",
      ["Plugin rule"],
      undefined,
      ["Brain rule"],
    );

    expect(instructions).toContain("### Brain-Specific Behavior (MANDATORY)");
    expect(instructions).toContain("Brain rule");
    expect(instructions).toContain("### Plugin-Specific Behavior (MANDATORY)");
    expect(instructions).toContain("Plugin rule");
    expect(instructions.indexOf("Brain rule")).toBeLessThan(
      instructions.indexOf("Plugin rule"),
    );
  });

  it("should append retrieved conversation memory as context, not mandatory behavior", () => {
    const instructions = buildInstructions(
      identity,
      "anchor",
      undefined,
      undefined,
      undefined,
      "Relevant conversation memory retrieved for this turn.",
    );

    expect(instructions).toContain(
      "### Retrieved Conversation Memory (CONTEXT)",
    );
    expect(instructions).toContain(
      "Relevant conversation memory retrieved for this turn.",
    );
    expect(instructions).not.toContain(
      "### Brain-Specific Behavior (MANDATORY)\n\nRelevant conversation memory",
    );
  });

  it("should tell the agent to capture lightweight memo requests without asking for more detail", () => {
    const instructions = buildInstructions(identity, "anchor");
    expect(instructions).toContain(
      "Create a `note` entity immediately with `content` instead of asking for more detail unless the request is truly empty.",
    );
    expect(instructions).toContain("save, or capture content");
  });

  it("should protect identity/profile singletons from vague delete requests", () => {
    const instructions = buildInstructions(identity, "anchor");
    expect(instructions).toContain(
      "`brain-character` and `anchor-profile` are protected singletons",
    );
    expect(instructions).toContain(
      'For vague phrases like "old brain", ask which saved agent/brain contact the user means or resolve `agent`',
    );
  });

  it("should tell the agent to preserve finalized deck content without prompt generation", () => {
    const instructions = buildInstructions(identity, "anchor");
    expect(instructions).toContain(
      "finalized deck markdown with frontmatter and slide separators must go in `content` only",
    );
    expect(instructions).toContain(
      "including `prompt` would request generation",
    );
  });

  it("should prohibit self-confirming durable write requests", () => {
    const instructions = buildInstructions(identity, "anchor");
    expect(instructions).toContain(
      "never pass `confirmed: true` on the initial user request",
    );
    expect(instructions).toContain(
      "Creating or generating entities with `system_create`",
    );
    expect(instructions).toContain(
      "For one create request, call `system_create` once only; never issue duplicate create calls",
    );
    expect(instructions).toContain(
      "For delete confirmation responses, explicitly say the item has not been deleted yet and needs confirmation",
    );
    expect(instructions).toContain(
      "Never self-confirm a durable write operation",
    );
  });

  it("should distinguish standalone image generation from entity-attached image targeting", () => {
    const instructions = buildInstructions(identity, "anchor");
    expect(instructions).toContain(
      'For standalone image requests like "generate an image of a robot", call `system_create({ entityType: "image", prompt: "..." })` without `targetEntityType` or `targetEntityId`.',
    );
    expect(instructions).toContain(
      "Only pass `targetEntityType`/`targetEntityId` when the user explicitly asks to set or replace a cover image, OG image, or other entity-attached image on an existing entity.",
    );
  });

  it("should distinguish cover image operations from OG image operations", () => {
    const instructions = buildInstructions(identity, "anchor");
    expect(instructions).toContain(
      '"Cover image" means the entity\'s `coverImageId`; "OG image", "social preview", or "Open Graph image" means `ogImageId`.',
    );
    expect(instructions).toContain(
      "Do not satisfy a cover-image request by reusing, setting, clearing, or mentioning `ogImageId`",
    );
    expect(instructions).toContain(
      'use one `system_create` call with `entityType: "image"`, a `prompt`, and pass `targetEntityType`/`targetEntityId`',
    );
    expect(instructions).toContain(
      "Do not call `system_update` with an existing image id for a generate/new-cover request",
    );
    expect(instructions).toContain(
      "For cover-image changes/removal, the field key is `coverImageId`",
    );
    expect(instructions).toContain(
      "Do not clear `ogImageId` for cover-removal requests, even if `system_get` shows an `ogImageId` and no current `coverImageId`.",
    );
  });

  it("should keep discussion and summary notes off upload import paths", () => {
    const instructions = buildInstructions(identity, "anchor");
    expect(instructions).toContain(
      "If the user asks to save an image description, image discussion, image interpretation, caption, summary, study notes, or your prior answer as a note, create a `note` entity with `content` from the conversation; do not call `system_upload_save`, do not import the image/PDF/file upload, and do not pass `upload` or `transform`.",
    );
    expect(instructions).toContain(
      "After you summarize/read/describe/analyze an uploaded file, follow-ups like “save it”, “save that”, “save the note”, or “save the summary” refer to the visible summary/notes you just wrote unless the user explicitly says to save/import/promote the uploaded PDF/file/document itself.",
    );
    expect(instructions).toContain(
      '`transform` is only for PDF/text/JSON/markdown-to-note extraction with `entityType: "note"`; never use `transform` for image uploads.',
    );
    expect(instructions).toContain(
      "Call exactly one `system_upload_save`; do not also create an alternate document/image entity",
    );
    expect(instructions).toContain(
      "Do not use `system_create` for status-only requests such as making an existing post a draft or for raw uploaded file preservation.",
    );
    expect(instructions).toContain(
      "If generating a social post from prior image discussion, use conversation text in `prompt`/`content` and omit `upload`",
    );
    expect(instructions).toContain(
      "If your image-generation args include `upload`, they are wrong unless the user explicitly said to use that uploaded image as the cover.",
    );
    expect(instructions).toContain(
      "Prior upload refs from the conversation are irrelevant to cover-image generation unless the user explicitly says to use the uploaded image as the cover.",
    );
  });

  it("should distinguish artifact previews from durable artifact saves", () => {
    const instructions = buildInstructions(identity, "anchor");
    expect(instructions).toContain(
      "If the user asks only to preview/render/generate a preview and a `document_generate` tool is available, call `document_generate`",
    );
    expect(instructions).toContain(
      "call `system_create` with `sourceAttachment` instead of `document_generate` so confirmation and persistence happen",
    );
    expect(instructions).toContain(
      "use the returned canonical entity `id` in `sourceAttachment.sourceEntityId` and continue to `system_create` in the same turn",
    );
  });

  it("should summarize listed items from retrieved content, not titles alone", () => {
    const instructions = buildInstructions(identity, "anchor");
    expect(instructions).toContain(
      'For follow-ups asking for full content/details of a listed item ("first one", "that post"), call `system_get` with the remembered listed ID',
    );
    expect(instructions).toContain(
      "In inventory-style overviews, report exact titles/counts/statuses from tool metadata; do not infer, rename, or summarize items from titles alone",
    );
    expect(instructions).toContain(
      "If the user asks to summarize listed items and the list result lacks body content, follow up with `system_get`",
    );
    expect(instructions).toContain(
      "summarize from the retrieved content rather than inferring from titles",
    );
  });

  it("should prevent draft blog post checks from fanning out across draft entity types", () => {
    const instructions = buildInstructions(identity, "anchor");
    expect(instructions).toContain(
      '"Do I have any draft blog posts?" requires only `system_list({ entityType: "post", status: "draft" })`',
    );
    expect(instructions).toContain(
      "do not also list social posts, newsletters, decks, or other draft entities",
    );
    expect(instructions).toContain(
      "if the prior draft list was empty, list published posts and ask which one to convert",
    );
    expect(instructions).toContain(
      'Never choose a published item yourself, never call `system_update` for an ambiguous "make one draft" follow-up, never offer to create a draft instead',
    );
  });

  it("should allow anchors to read restricted tool results", () => {
    const instructions = buildInstructions(identity, "anchor");
    expect(instructions).toContain(
      "reading restricted/private content returned by tools",
    );
    expect(instructions).toContain(
      "when an anchor asks to show/read a record, include the requested content exactly as you would for public content",
    );
    expect(instructions).toContain(
      "Public/trusted callers must not receive restricted content from denied tools or higher-permission conversation turns",
    );
  });

  it("should stop after one lookup when write tools are unavailable", () => {
    const instructions = buildInstructions(identity, "public");
    expect(instructions).toContain(
      "For questions about the caller's own permission level, answer from Current User/available tools without tool calls",
    );
    expect(instructions).toContain(
      "If a requested write/action tool is unavailable, do not loop through reads",
    );
    expect(instructions).toContain(
      'For public create/update/delete requests, do not call read tools merely to compensate, and avoid "done", "saved", "created", or "deleted" phrasing even in negated forms',
    );
    expect(instructions).toContain(
      "after at most one target lookup, state the caller cannot perform that action with current permissions",
    );
  });

  it("should teach the model to verify confirmed update state with system_get instead of looping", () => {
    const instructions = buildInstructions(identity, "anchor");
    expect(instructions).toContain(
      "If the user asks to show, display, read back, verify, or check the latest state of a known entity after an update/confirmation, call `system_get`",
    );
    expect(instructions).toContain(
      "If a previous confirmed action returned a `Completed:` response or a successful tool result, treat it as completed.",
    );
  });

  it("should tell the model to publish the entity just changed to draft", () => {
    const instructions = buildInstructions(identity, "anchor");
    expect(instructions).toContain(
      'If a prior confirmed update changed an entity to draft, a follow-up like "publish it now" means publish that same entity',
    );
    expect(instructions).toContain("call `content-pipeline_publish`");
    expect(instructions).toContain(
      "Trust the tool result metadata/current status over embedded markdown frontmatter when they differ",
    );
    expect(instructions).toContain(
      'if metadata says `status: "draft"`, do not answer that it is already published',
    );
    expect(instructions).toContain(
      'If a confirmed `system_update` just changed a post to `fields.status: "draft"`, and the user then asks to publish it, call the publish tool for that same canonical post ID.',
    );
    expect(instructions).toContain(
      "Do not re-resolve by title, do not trust stale frontmatter over the confirmed update result, and do not ask which version they mean.",
    );
  });

  it("should tell the model to act after resolving exact update targets", () => {
    const instructions = buildInstructions(identity, "anchor");
    expect(instructions).toContain(
      "Once `system_get` returns a single matching entity for an exact title/slug",
    );
    expect(instructions).toContain(
      "call the requested `system_update`/publish tool in the same turn",
    );
    expect(instructions).toContain(
      "Do not ask which item, and do not add a broad list call",
    );
  });

  it("should tell the model to choose a requested title and update it", () => {
    const instructions = buildInstructions(identity, "anchor");
    expect(instructions).toContain(
      "If the user asks you to choose a missing title/name",
    );
    expect(instructions).toContain(
      "call `system_update` with `fields.title` immediately",
    );
  });

  it("should not substitute search for unavailable extract actions", () => {
    const instructions = buildInstructions(identity, "public");
    expect(instructions).toContain(
      "If `system_extract` is not available to the current caller, do not substitute `system_search`",
    );
    expect(instructions).toContain(
      "say the caller cannot generate/extract topics with their current permissions",
    );
  });

  it("should teach the model to refuse never-gated and level-gated actions", () => {
    const instructions = buildInstructions(identity, "trusted");
    expect(instructions).toContain("### Entity Action Permissions");
    expect(instructions).toContain("Hard-denied actions");
    expect(instructions).toContain("Level-gated actions");
    expect(instructions).toContain("do not retry the same call");
  });
});
