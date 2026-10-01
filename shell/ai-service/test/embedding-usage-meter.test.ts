import { describe, expect, it } from "bun:test";
import { EmbeddingUsageMeter } from "../src/embedding-usage-meter";

// What a turn spent on embeddings, however deep in its work they were made:
// a search a tool ran, or the search that found an answer's sources.
describe("embedding usage meter", () => {
  it("counts the embeddings made while measuring, across awaits", async () => {
    const meter = EmbeddingUsageMeter.createFresh();
    const { value, usage } = await meter.measure(async () => {
      meter.record("text-embedding-3-small", 12);
      await Promise.resolve();
      meter.record("text-embedding-3-small", 30);
      return "answer";
    });
    expect(value).toBe("answer");
    expect(usage).toEqual([
      { model: "text-embedding-3-small", tokens: 12 },
      { model: "text-embedding-3-small", tokens: 30 },
    ]);
  });

  it("counts nothing made outside a measurement", async () => {
    const meter = EmbeddingUsageMeter.createFresh();
    meter.record("text-embedding-3-small", 99);
    const { usage } = await meter.measure(async () => "nothing embedded");
    expect(usage).toEqual([]);
  });

  it("keeps turns that run at the same time apart", async () => {
    const meter = EmbeddingUsageMeter.createFresh();
    // The first turn records only after the second has recorded, so both
    // measurements are open at once.
    const { promise: secondRecorded, resolve: markSecond } =
      Promise.withResolvers<void>();
    const first = meter.measure(async () => {
      await secondRecorded;
      meter.record("text-embedding-3-small", 1);
    });
    const second = meter.measure(async () => {
      meter.record("text-embedding-3-small", 2);
      markSecond();
    });
    const [one, two] = await Promise.all([first, second]);
    expect(one.usage).toEqual([{ model: "text-embedding-3-small", tokens: 1 }]);
    expect(two.usage).toEqual([{ model: "text-embedding-3-small", tokens: 2 }]);
  });
});
