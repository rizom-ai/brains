import { describe, expect, it } from "bun:test";
import {
  normalizeTopicTitle,
  scoreTopicSimilarity,
} from "../../src/lib/topic-merge";

describe("topic-merge", () => {
  it("normalizes collaboration title variants to the same core form", () => {
    expect(normalizeTopicTitle("Human-AI Collaboration")).toBe(
      "human agent collaboration",
    );
    expect(normalizeTopicTitle("Human-Agent Collaboration")).toBe(
      "human agent collaboration",
    );
    expect(normalizeTopicTitle("Human-Bot Collaboration")).toBe(
      "human agent collaboration",
    );
  });

  it("does not over-collapse generic rhetorical titles", () => {
    expect(normalizeTopicTitle("Agency in Human-AI Collaboration")).toBe(
      "agency human agent collaboration",
    );
  });

  it("collapses strong rhetorical head concepts", () => {
    expect(normalizeTopicTitle("Fragmentation as Opportunity")).toBe(
      "fragmentation",
    );
    expect(normalizeTopicTitle("Fragmentation in Digital Ecosystems")).toBe(
      "fragmentation",
    );
  });

  it("scores near-duplicate collaboration topics above merge threshold", () => {
    const score = scoreTopicSimilarity(
      {
        title: "Agency in Human-AI Collaboration",
        keywords: ["agency", "AI agents", "knowledge management"],
      },
      {
        title: "Human-Agent Collaboration",
        keywords: ["AI agents", "agency", "distributed work"],
      },
    );

    expect(score).toBeGreaterThanOrEqual(0.85);
  });

  it("scores fragmentation variants above merge threshold", () => {
    const score = scoreTopicSimilarity(
      {
        title: "Fragmentation as Opportunity",
        keywords: ["fragmentation", "innovation", "resilience"],
      },
      {
        title: "Fragmentation and Multiplicity",
        keywords: ["fragmentation", "multiplicity", "value pluralism"],
      },
    );

    expect(score).toBeGreaterThanOrEqual(0.85);
  });

  it("does not score unrelated topics above merge threshold", () => {
    const score = scoreTopicSimilarity(
      {
        title: "Biomimicry",
        keywords: ["nature", "design", "innovation"],
      },
      {
        title: "Educational Technology",
        keywords: ["learning", "classroom", "pedagogy"],
      },
    );

    expect(score).toBeLessThan(0.85);
  });
});
