import { describe, expect, it } from "bun:test";
import { createMockShell } from "@brains/plugins/test";
import { createSeminarPlugins } from "./seminar-plugins";

describe("the seminar package's instructions", () => {
  it("puts a question to the peers and keeps each answer its author's", async () => {
    const shell = createMockShell();
    const registered = await Promise.all(
      createSeminarPlugins().map((plugin) => plugin.register(shell)),
    );
    const text = registered
      .map((capabilities) => capabilities.instructions ?? "")
      .join("\n");

    expect(text).toContain("put it to them with network_ask before answering");
    expect(text).toContain("Give each peer's answer under his name");
    expect(text).toContain(
      "Add no quotation and no citation that a peer's answer did not give",
    );
    expect(text).toContain("say so plainly");
    expect(text).toContain("where they meet and where they part");
  });
});
