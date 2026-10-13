import { describe, expect, it } from "bun:test";
import {
  canReceiveNativeArtifactFile,
  resolveMessageArtifactAccess,
  type MessageArtifactEntity,
} from "../../src/message-interface/artifact-access";
import type { ArtifactEntityRef } from "../../src/message-interface/artifact-entity";
import type { ContentVisibility } from "@brains/entity-service";

describe("resolveMessageArtifactAccess", () => {
  const entityRef: ArtifactEntityRef = {
    entityType: "document",
    id: "doc-1",
  };
  const entity: MessageArtifactEntity = {
    content: "data:application/pdf;base64,Zm9v",
    metadata: { filename: "doc.pdf" },
  };

  /** An entity visible at `visibleFrom` and above; records the scopes asked. */
  function lookup(visibleFrom: ContentVisibility | null): {
    asked: ContentVisibility[];
    getEntity: (
      ref: ArtifactEntityRef,
      scope: ContentVisibility,
    ) => Promise<MessageArtifactEntity | undefined>;
  } {
    const order: ContentVisibility[] = ["public", "shared", "restricted"];
    const asked: ContentVisibility[] = [];
    return {
      asked,
      getEntity: async (
        ref,
        scope,
      ): Promise<MessageArtifactEntity | undefined> => {
        expect(ref).toEqual(entityRef);
        asked.push(scope);
        return visibleFrom !== null &&
          order.indexOf(scope) >= order.indexOf(visibleFrom)
          ? entity
          : undefined;
      },
    };
  }

  it("returns visible entities within the caller visibility scope", async () => {
    const { asked, getEntity } = lookup("shared");

    const result = await resolveMessageArtifactAccess({
      entityRef,
      userLevel: "trusted",
      getEntity,
    });

    expect(result).toEqual({ status: "visible", entity });
    expect(asked).toEqual(["shared"]);
  });

  // An unscoped read sees public entities only, so the existence check has to
  // ask at full scope or a restricted artifact reads as missing, not denied.
  it("returns denied when the entity exists only above the caller's scope", async () => {
    const { asked, getEntity } = lookup("restricted");

    const result = await resolveMessageArtifactAccess({
      entityRef,
      userLevel: "public",
      getEntity,
    });

    expect(result).toEqual({ status: "denied" });
    expect(asked).toEqual(["public", "restricted"]);
  });

  it("returns missing when the entity cannot be found at any scope", async () => {
    const { getEntity } = lookup(null);

    const result = await resolveMessageArtifactAccess({
      entityRef,
      userLevel: "public",
      getEntity,
    });

    expect(result).toEqual({ status: "missing" });
  });
});

describe("canReceiveNativeArtifactFile", () => {
  it("allows Admin and trusted callers only", () => {
    expect(canReceiveNativeArtifactFile("admin")).toBe(true);
    expect(canReceiveNativeArtifactFile("trusted")).toBe(true);
    expect(canReceiveNativeArtifactFile("public")).toBe(false);
  });
});
