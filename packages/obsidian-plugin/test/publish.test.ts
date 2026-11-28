import { afterEach, describe, expect, it } from "bun:test";
import type { HttpRequest, HttpResponse } from "../src/engine";
import { connect, fresh, type Synced } from "./helpers/setup";

let synced: Synced | undefined;
afterEach(async () => synced?.brain.close());

async function withTea(): Promise<Synced> {
  const made = await fresh();
  await made.brain.write("note", "tea", "# Tea\n\nSteep it.\n");
  await connect(made);
  return made;
}

const answer = (status: number, body: unknown = ""): HttpResponse => ({
  status,
  headers: {},
  body: new TextEncoder().encode(
    typeof body === "string" ? body : JSON.stringify(body),
  ),
});

/** Answer the brain's publish call with this, and everything else as it is. */
function answering(made: Synced, reply: () => HttpResponse): HttpRequest[] {
  const asked: HttpRequest[] = [];
  const reachable = made.brain.fetch;
  made.brain.fetch = async (request): Promise<HttpResponse> => {
    if (!request.url.endsWith("/.brain/publish")) return reachable(request);
    asked.push(request);
    return reply();
  };
  return asked;
}

const bodyOf = (request: HttpRequest | undefined): unknown =>
  JSON.parse(new TextDecoder().decode(request?.body));

/**
 * "Publish" on a file asks the brain to publish the entry it is, now. The
 * brain decides whether it may be; the plugin makes sure the brain has the
 * text the person sees first.
 */
describe("publishing the entry a file is", () => {
  it("asks the brain for the file, and says where it was published", async () => {
    synced = await withTea();
    const asked = answering(synced, () =>
      answer(200, { published: true, url: "https://example.com/tea" }),
    );

    expect(await synced.engine.publish("tea.md")).toEqual({
      status: "published",
      url: "https://example.com/tea",
    });
    expect(asked.map((request) => request.method)).toEqual(["POST"]);
    expect(bodyOf(asked[0])).toEqual({ path: "tea.md" });
  });

  it("sends what the person changed before it asks", async () => {
    synced = await withTea();
    synced.vault.setText("tea.md", "# Tea\n\nThree minutes.\n");
    const made = synced;
    const seen: Array<string | undefined> = [];
    answering(synced, () => {
      seen.push(
        made.brain.requests.filter((one) => one.startsWith("PUT")).at(-1),
      );
      return answer(200, { published: true });
    });

    expect(await synced.engine.publish("tea.md")).toEqual({
      status: "published",
    });
    // The save went up before the brain was asked to publish.
    expect(seen).toEqual(["PUT /dav/tea.md"]);
    expect((await synced.brain.get("note", "tea"))?.content).toContain(
      "Three minutes.",
    );
  });

  it("passes on the brain's reason when it refuses", async () => {
    synced = await withTea();
    answering(synced, () => answer(409, "Missing required fields: excerpt"));

    expect(await synced.engine.publish("tea.md")).toEqual({
      status: "refused",
      reason: "Missing required fields: excerpt",
    });
  });

  it("is not asked for a file the brain does not hold", async () => {
    synced = await withTea();
    synced.vault.setText("Projects/idea.md", "# Idea\n");
    const asked = answering(synced, () => answer(200, { published: true }));

    expect(await synced.engine.publish("Projects/idea.md")).toEqual({
      status: "not-in-brain",
    });
    expect(asked).toEqual([]);
  });

  it("says so when the brain is from before it could be asked", async () => {
    synced = await withTea();
    answering(synced, () => answer(405));

    expect(await synced.engine.publish("tea.md")).toEqual({
      status: "old-brain",
    });
  });

  it("says so when nothing publishes on this brain", async () => {
    synced = await withTea();

    // This brain runs no publishing pipeline.
    expect(await synced.engine.publish("tea.md")).toEqual({
      status: "unavailable",
    });
  });

  it("says so when the brain cannot be reached", async () => {
    synced = await withTea();
    synced.brain.online = false;

    expect(await synced.engine.publish("tea.md")).toEqual({
      status: "offline",
    });
  });
});
