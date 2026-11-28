import { afterEach, describe, expect, it } from "bun:test";
import type { HttpResponse } from "@brains/vault-sync";
import { connect, fresh, type Synced } from "@brains/vault-sync/test";

let synced: Synced | undefined;
afterEach(async () => synced?.brain.close());

async function withTea(): Promise<Synced> {
  const made = await fresh();
  await made.brain.write("note", "tea", "# Tea\n\nSteep it.\n");
  await made.brain.write("note", "kettles", "# Kettles\n");
  await connect(made);
  return made;
}

const json = (body: unknown): HttpResponse => ({
  status: 200,
  headers: { "content-type": "application/json" },
  body: new TextEncoder().encode(JSON.stringify(body)),
});

/** Answer the brain's related call with this, and everything else as it is. */
function answering(made: Synced, answer: () => HttpResponse): string[] {
  const asked: string[] = [];
  const reachable = made.brain.fetch;
  made.brain.fetch = async (request): Promise<HttpResponse> => {
    if (!request.url.includes("/.brain/related")) return reachable(request);
    asked.push(new URL(request.url).search);
    return answer();
  };
  return asked;
}

/**
 * Beside an open note, the entries the brain holds nearest to it: asked of
 * the brain for the note's file, and shown as files of the vault.
 */
describe("the notes related to a note", () => {
  it("are asked of the brain for a note it holds", async () => {
    synced = await withTea();

    // This brain keeps no index of meaning, and says so.
    expect(await synced.engine.related("tea.md")).toEqual({
      status: "no-index",
    });
    expect(synced.brain.requests.at(-1)).toBe("GET /dav/.brain/related");
  });

  it("are the brain's answer, each told whether the vault holds its file", async () => {
    synced = await withTea();
    const asked = answering(synced, () =>
      json({
        related: [
          {
            path: "kettles.md",
            title: "Kettles",
            entityType: "note",
            distance: 0.1,
          },
          {
            path: "wishlist/pot.md",
            title: "A pot",
            entityType: "wishlist",
            distance: 0.3,
          },
        ],
      }),
    );

    const answer = await synced.engine.related("tea.md", 5);

    expect(asked).toEqual(["?path=tea.md&limit=5"]);
    expect(answer).toEqual({
      status: "ok",
      entries: [
        {
          path: "kettles.md",
          title: "Kettles",
          entityType: "note",
          distance: 0.1,
          inVault: true,
        },
        {
          path: "wishlist/pot.md",
          title: "A pot",
          entityType: "wishlist",
          distance: 0.3,
          inVault: false,
        },
      ],
    });
  });

  it("are not asked for a file the brain does not hold", async () => {
    synced = await withTea();
    synced.vault.setText("Projects/idea.md", "# Idea\n");
    synced.vault.setText("fresh.md", "# Not uploaded yet\n");
    const asked = answering(synced, () => json({ related: [] }));

    expect(await synced.engine.related("Projects/idea.md")).toEqual({
      status: "not-in-brain",
    });
    expect(await synced.engine.related("fresh.md")).toEqual({
      status: "not-in-brain",
    });
    expect(asked).toEqual([]);
  });

  it("say so when the brain is from before it could tell", async () => {
    synced = await withTea();
    answering(synced, () => ({
      status: 404,
      headers: {},
      body: new Uint8Array(),
    }));

    expect(await synced.engine.related("tea.md")).toEqual({
      status: "old-brain",
    });
  });

  it("say so when the brain cannot be reached", async () => {
    synced = await withTea();
    synced.brain.online = false;

    expect(await synced.engine.related("tea.md")).toEqual({
      status: "offline",
    });
  });

  it("take an answer that is not one as no answer", async () => {
    synced = await withTea();
    answering(synced, () => json({ something: "else" }));

    expect(await synced.engine.related("tea.md")).toEqual({
      status: "unavailable",
    });
  });
});
