import { describe, it, expect } from "bun:test";
import { ProjectBodyFormatter } from "../../src/formatters/project-formatter";

describe("ProjectBodyFormatter", () => {
  const formatter = new ProjectBodyFormatter();

  it("should format project content to markdown", () => {
    const data = {
      context: "Background info here.",
      problem: "The challenge we faced.",
      solution: "What we built.",
      outcome: "The results.",
    };

    const result = formatter.format(data);

    expect(result).toContain("## Context");
    expect(result).toContain("Background info here.");
    expect(result).toContain("## Problem");
    expect(result).toContain("The challenge we faced.");
    expect(result).toContain("## Solution");
    expect(result).toContain("What we built.");
    expect(result).toContain("## Outcome");
    expect(result).toContain("The results.");
  });

  it("should parse markdown sections back to data", () => {
    const markdown = `# Project

## Context
Background info here.

## Problem
The challenge we faced.

## Solution
What we built.

## Outcome
The results.
`;

    const result = formatter.parse(markdown);

    expect(result.context).toBe("Background info here.");
    expect(result.problem).toBe("The challenge we faced.");
    expect(result.solution).toBe("What we built.");
    expect(result.outcome).toBe("The results.");
  });

  it("should handle roundtrip conversion", () => {
    const data = {
      context: "The company needed a new platform.",
      problem: "Legacy system was unmaintainable.",
      solution: "Built a modern architecture with plugins.",
      outcome: "50% faster development cycles.",
    };

    const formatted = formatter.format(data);
    const parsed = formatter.parse(formatted);

    expect(parsed).toEqual(data);
  });

  it("should parse content without # Title heading", () => {
    const markdown = `## Context
Background info.

## Problem
The challenge.

## Solution
The approach.

## Outcome
The results.
`;

    const result = formatter.parse(markdown);

    expect(result.context).toBe("Background info.");
    expect(result.problem).toBe("The challenge.");
    expect(result.solution).toBe("The approach.");
    expect(result.outcome).toBe("The results.");
  });

  it("should handle empty sections", () => {
    const data = {
      context: "",
      problem: "",
      solution: "",
      outcome: "",
    };

    const formatted = formatter.format(data);
    const parsed = formatter.parse(formatted);

    expect(parsed).toEqual(data);
  });

  it("should return correct labels", () => {
    const labels = formatter.getLabels();

    expect(labels).toEqual({
      context: "Context",
      problem: "Problem",
      solution: "Solution",
      outcome: "Outcome",
    });
  });
});
