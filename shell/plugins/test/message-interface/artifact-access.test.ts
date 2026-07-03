import { describe, expect, it } from "bun:test";
import {
  canReceiveNativeArtifactFile,
  resolveMessageArtifactAccess,
  type MessageArtifactEntity,
} from "../../src/message-interface/artifact-access";
import type { ArtifactEntityRef } from "../../src/message-interface/artifact-entity";

describe("resolveMessageArtifactAccess", () => {
  const entityRef: ArtifactEntityRef = {
    entityType: "document",
    id: "doc-1",
  };
  const entity: MessageArtifactEntity = {
    content: "data:application/pdf;base64,Zm9v",
    metadata: { filename: "doc.pdf" },
  };

  it("returns visible entities within the caller visibility scope", async () => {
    const result = await resolveMessageArtifactAccess({
      entityRef,
      userLevel: "trusted",
      getEntity: async (): Promise<MessageArtifactEntity | undefined> => entity,
      getVisibleEntity: async (
        ref,
        visibilityScope,
      ): Promise<MessageArtifactEntity | undefined> => {
        expect(ref).toEqual(entityRef);
        expect(visibilityScope).toBe("shared");
        return entity;
      },
    });

    expect(result).toEqual({ status: "visible", entity });
  });

  it("returns denied when the entity exists but is not visible at caller scope", async () => {
    const result = await resolveMessageArtifactAccess({
      entityRef,
      userLevel: "public",
      getEntity: async (): Promise<MessageArtifactEntity | undefined> => entity,
      getVisibleEntity: async (): Promise<undefined> => undefined,
    });

    expect(result).toEqual({ status: "denied" });
  });

  it("returns missing when the entity cannot be found at any scope", async () => {
    const result = await resolveMessageArtifactAccess({
      entityRef,
      userLevel: "public",
      getEntity: async (): Promise<undefined> => undefined,
      getVisibleEntity: async (): Promise<undefined> => undefined,
    });

    expect(result).toEqual({ status: "missing" });
  });
});

describe("canReceiveNativeArtifactFile", () => {
  it("allows anchor and trusted callers only", () => {
    expect(canReceiveNativeArtifactFile("anchor")).toBe(true);
    expect(canReceiveNativeArtifactFile("trusted")).toBe(true);
    expect(canReceiveNativeArtifactFile("public")).toBe(false);
  });
});
