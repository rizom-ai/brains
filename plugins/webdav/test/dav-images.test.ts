import { describe, expect, it } from "bun:test";
import { dest, doc, drive } from "./drive";
import { fakeBrain, type FakeBrain } from "./fake-brain";
import { entity } from "./fake-reader";

const PNG = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  ),
  (char) => char.charCodeAt(0),
);
/** A 2×3 GIF header: enough to be recognized and measured. */
const GIF = Uint8Array.from([
  0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 2, 0, 3, 0, 0, 0, 0, 0x3b,
]);
const OLD = new Uint8Array([137, 80, 78, 71, 9, 9, 9]);
const OLD_REF = `asset://sha256/${"b".repeat(64)}` as const;

function library(): FakeBrain {
  return fakeBrain(
    [
      entity("note", "readme", { content: doc("Readme") }),
      entity("image", "cover", {
        content: OLD_REF,
        metadata: { format: "png", title: "Cover", alt: "The cover" },
      }),
      entity("image", "board-chart", {
        content: OLD_REF,
        metadata: { format: "png" },
        visibility: "restricted",
      }),
      entity("post", "first", { content: doc("First") }),
    ],
    ["note", "post", "image", "document"],
    { [OLD_REF]: OLD },
  );
}

describe("WebDAV image files", () => {
  it("replaces an image's bytes and keeps what describes it", async () => {
    const brain = library();
    const dav = drive(brain);

    const response = await dav("PUT", "/dav/image/cover.png", { body: PNG });

    expect(response.status).toBe(204);
    const saved = brain.entities.find((candidate) => candidate.id === "cover");
    expect(saved?.content).toMatch(/^asset:\/\/sha256\/[0-9a-f]{64}$/);
    expect(saved?.content).not.toBe(OLD_REF);
    expect(saved?.metadata).toEqual({
      title: "Cover",
      alt: "The cover",
      format: "png",
      mediaType: "image/png",
      width: 1,
      height: 1,
      sizeBytes: PNG.byteLength,
    });
    expect(brain.updates[0]).toMatchObject({
      expectedContentHash: "hash-image-cover",
      interfaceType: "webdav",
    });
    expect(response.headers.get("etag")).toBe(`"${saved?.contentHash}"`);
    expect(
      new Uint8Array(
        await (await dav("GET", "/dav/image/cover.png")).arrayBuffer(),
      ),
    ).toEqual(PNG);
    expect(brain.discarded).toEqual([]);
  });

  it("creates an image from a new file, public and only if absent", async () => {
    const brain = library();
    const dav = drive(brain);

    const response = await dav("PUT", "/dav/image/diagram.png", { body: PNG });

    expect(response.status).toBe(201);
    expect(brain.creates[0]?.entity).toMatchObject({
      entityType: "image",
      id: "diagram",
      visibility: "public",
      metadata: { format: "png", width: 1, height: 1 },
    });
    expect(
      (await dav("GET", "/dav/image/diagram.png")).headers.get(
        "content-length",
      ),
    ).toBe(String(PNG.byteLength));

    // The id is taken by an image this person cannot see.
    expect(
      (await dav("PUT", "/dav/image/board-chart.png", { body: PNG })).status,
    ).toBe(412);
    expect(brain.discarded).toHaveLength(1);
  });

  it("stores an image only under the extension its bytes have", async () => {
    const brain = library();
    const dav = drive(brain);

    const wrong = await dav("PUT", "/dav/image/animation.png", { body: GIF });
    expect(wrong.status).toBe(422);
    expect(await wrong.text()).toContain(".gif");
    expect(
      (await dav("PUT", "/dav/image/animation.gif", { body: GIF })).status,
    ).toBe(201);
    // Replacing a PNG with another format would move the file.
    expect(
      (await dav("PUT", "/dav/image/cover.png", { body: GIF })).status,
    ).toBe(422);
    expect(brain.creates).toHaveLength(1);
    expect(brain.updates).toEqual([]);
  });

  it("refuses bytes that are no supported image, a file over the asset limit and an image outside the image folder", async () => {
    const brain = library();
    const dav = drive(brain);

    const text = await dav("PUT", "/dav/image/notes.png", {
      body: "not an image",
    });
    expect(text.status).toBe(422);
    expect(await text.text()).toContain("PNG, JPEG, GIF or WebP");
    expect(
      (await dav("PUT", "/dav/image/big.png", { body: new Uint8Array(4097) }))
        .status,
    ).toBe(413);
    expect(
      (await dav("PUT", "/dav/post/photo.png", { body: PNG })).status,
    ).toBe(403);
    expect((await dav("PUT", "/dav/photo.png", { body: PNG })).status).toBe(
      403,
    );
    expect(brain.creates).toEqual([]);
    expect(Object.keys(brain.assets)).toEqual([OLD_REF]);
  });

  it("takes an image larger than a text file may be", async () => {
    const brain = library();
    brain.options.writes.maxFileBytes = 16;
    expect(
      (await drive(brain)("PUT", "/dav/image/diagram.png", { body: PNG }))
        .status,
    ).toBe(201);
  });

  it("saves an image an editor wrote to a temporary file first", async () => {
    const brain = library();
    const dav = drive(brain);
    await dav("PUT", "/dav/image/.cover.png.tmp", { body: PNG });

    const moved = await dav("MOVE", "/dav/image/.cover.png.tmp", {
      headers: dest("/dav/image/cover.png"),
    });

    expect(moved.status).toBe(204);
    expect(
      brain.entities.find((c) => c.id === "cover")?.metadata["sizeBytes"],
    ).toBe(PNG.byteLength);
  });

  it("does not replace an image changed while its bytes were being stored", async () => {
    const brain = library();
    brain.beforeNextUpdate = (): void => {
      const index = brain.entities.findIndex((c) => c.id === "cover");
      const current = brain.entities[index];
      if (current)
        brain.entities[index] = { ...current, contentHash: "moved-on" };
    };

    const response = await drive(brain)("PUT", "/dav/image/cover.png", {
      body: PNG,
    });

    expect(response.status).toBe(412);
    // The staged bytes are dropped, not left behind.
    expect(brain.discarded).toHaveLength(1);
  });

  it("applies the action policy before any bytes are stored, and takes no documents", async () => {
    const brain = library();
    brain.options.writes.permissions = {
      assertEntityActionAllowed: (): void => {
        throw new Error("Images are managed elsewhere.");
      },
    };
    const dav = drive(brain);

    expect(
      (await dav("PUT", "/dav/image/cover.png", { body: PNG })).status,
    ).toBe(403);
    expect((await dav("PUT", "/dav/image/new.png", { body: PNG })).status).toBe(
      403,
    );
    expect(brain.discarded).toEqual([]);
    expect(Object.keys(brain.assets)).toEqual([OLD_REF]);

    await dav("MKCOL", "/dav/document/");
    expect(
      (await dav("PUT", "/dav/document/report.pdf", { body: "%PDF-1.7" }))
        .status,
    ).toBe(403);
  });
});
