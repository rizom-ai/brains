import {
  expectConfirmationArgs,
  expectToolConfirmation,
  expectToolError,
} from "@brains/mcp-service/test";
import { describe, expect, it } from "bun:test";
import type { BaseEntity } from "@brains/entity-service";
import { uploadContext, uploadFixture } from "./upload-fixtures";

const meetingUpload = {
  id: "upload-00000000-0000-4000-8000-000000000c01",
  filename: "2026-10-meeting.md",
  mediaType: "text/markdown",
  content: "# Quarterly Planning Sync\n\nRetry me.",
};

function importRequest(): Record<string, unknown> {
  return {
    entityType: "note",
    source: {
      kind: "upload",
      upload: { kind: "upload", id: meetingUpload.id },
      transform: "extract-markdown",
    },
  };
}

function failedNote(
  visibility: BaseEntity["visibility"] = "public",
): BaseEntity {
  return {
    id: "quarterly-planning-sync",
    entityType: "note",
    content:
      "---\ntitle: Quarterly Planning Sync\nstatus: failed\nerror: boom\n---\n",
    contentHash: "hash",
    visibility,
    metadata: {
      title: "Quarterly Planning Sync",
      status: "failed",
      error: "boom",
    },
    created: new Date(0).toISOString(),
    updated: new Date(0).toISOString(),
  };
}

describe("system_create retrying a failed upload", () => {
  it("replaces the failed note a retried import is saved over", async () => {
    const { tool, services, noteImports } = uploadFixture([meetingUpload]);
    services.addEntities([failedNote()]);
    const presentWhenImported: boolean[] = [];
    const interceptor = services.entityRegistry.getCreateInterceptor("note");
    services.entityRegistry.registerCreateInterceptor(
      "note",
      async (input, context) => {
        presentWhenImported.push(
          services.getEntities().has("quarterly-planning-sync"),
        );
        if (!interceptor) throw new Error("note interceptor missing");
        return interceptor(input, context);
      },
    );

    const pending = await tool.handler(importRequest(), uploadContext());
    expect(expectToolConfirmation(pending).preview).toContain(
      'Replaces: failed note "quarterly-planning-sync"',
    );
    const saved = await tool.handler(
      expectConfirmationArgs(pending),
      uploadContext(),
    );

    expect(saved).toMatchObject({ success: true });
    expect(presentWhenImported).toEqual([false]);
    expect(noteImports.map((input) => input.title)).toEqual([
      "Quarterly Planning Sync",
    ]);
  });

  it("replaces a failed private note the caller can see", async () => {
    const { tool, services } = uploadFixture([meetingUpload]);
    services.addEntities([failedNote("restricted")]);

    const pending = await tool.handler(importRequest(), uploadContext());
    const saved = await tool.handler(
      expectConfirmationArgs(pending),
      uploadContext(),
    );

    expect(saved).toMatchObject({ success: true });
    expect(services.getEntities().has("quarterly-planning-sync")).toBe(false);
  });

  it("still refuses a note that did not fail", async () => {
    const { tool, services } = uploadFixture([meetingUpload]);
    services.addEntities([
      {
        ...failedNote("restricted"),
        metadata: { title: "Quarterly Planning Sync" },
      },
    ]);

    const result = await tool.handler(importRequest(), uploadContext());

    expect(expectToolError(result).error).toContain("already exists");
  });

  it("does not replace a failed note for a caller who may not delete it", async () => {
    const { tool, services } = uploadFixture([meetingUpload]);
    services.addEntities([failedNote()]);

    const result = await tool.handler(importRequest(), {
      ...uploadContext(),
      userPermissionLevel: "trusted",
    });

    expect(expectToolError(result).error).toContain("already exists");
  });
});
