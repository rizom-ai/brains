import { describe, expect, mock, test } from "bun:test";
import type {
  CreateExecutionContext,
  CreateInput,
  CreateInterceptionResult,
} from "@brains/entity-service";
import { createUploadSaveHandler } from "../../src/entity/upload-save";

const executionContext: CreateExecutionContext = {
  interfaceType: "web-chat",
  actor: { kind: "user", userId: "operator" },
};

describe("createUploadSaveHandler", () => {
  test("rewrites the save into a create-from-upload input", async () => {
    const promote = mock(
      async (
        _input: CreateInput,
        _executionContext: CreateExecutionContext,
      ): Promise<CreateInterceptionResult> => ({
        kind: "handled",
        result: {
          success: true,
          data: { entityId: "brief", status: "created" },
        },
      }),
    );
    const handler = createUploadSaveHandler(
      "document",
      promote,
      "Document upload save was not handled",
    );

    const result = await handler(
      {
        title: "Brief",
        visibility: "shared",
        upload: { kind: "upload", id: "upload-1" },
      },
      executionContext,
    );

    expect(result).toEqual({
      success: true,
      data: { entityId: "brief", status: "created" },
    });
    expect(promote).toHaveBeenCalledWith(
      {
        entityType: "document",
        title: "Brief",
        visibility: "shared",
        from: { kind: "upload", id: "upload-1" },
      },
      executionContext,
    );
  });

  test("omits title and visibility the save did not carry", async () => {
    const promote = mock(
      async (
        _input: CreateInput,
        _executionContext: CreateExecutionContext,
      ): Promise<CreateInterceptionResult> => ({
        kind: "handled",
        result: { success: false, error: "Upload ref not found" },
      }),
    );
    const handler = createUploadSaveHandler(
      "image",
      promote,
      "Image upload save was not handled",
    );

    const result = await handler(
      { upload: { kind: "upload", id: "upload-2" } },
      executionContext,
    );

    expect(result).toEqual({ success: false, error: "Upload ref not found" });
    const [input] = promote.mock.calls[0] ?? [];
    expect(input).toEqual({
      entityType: "image",
      from: { kind: "upload", id: "upload-2" },
    });
    expect(input).not.toHaveProperty("title");
    expect(input).not.toHaveProperty("visibility");
  });

  test("fails with the given error when the promotion does not handle the save", async () => {
    const handler = createUploadSaveHandler(
      "image",
      async (input) => ({ kind: "continue", input }),
      "Image upload save was not handled",
    );

    const result = await handler(
      { upload: { kind: "upload", id: "upload-3" } },
      executionContext,
    );

    expect(result).toEqual({
      success: false,
      error: "Image upload save was not handled",
    });
  });
});
