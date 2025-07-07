/** @jsxImportSource react */
import { describe, test, expect } from "bun:test";
import React from "react";
import { render } from "ink-testing-library";
import { ProgressBar } from "../src/components/ProgressBar";

describe("ProgressBar", () => {
  test("renders basic progress bar", () => {
    const { lastFrame } = render(<ProgressBar current={5} total={10} />);

    expect(lastFrame()).toContain("█");
    expect(lastFrame()).toContain("░");
    expect(lastFrame()).toContain("5/10");
    expect(lastFrame()).toContain("50%");
  });

  test("renders with custom message", () => {
    const { lastFrame } = render(
      <ProgressBar current={3} total={10} message="Processing..." />,
    );

    expect(lastFrame()).toContain("Processing...");
  });

  test("handles completed progress", () => {
    const { lastFrame } = render(<ProgressBar current={10} total={10} />);

    expect(lastFrame()).toContain("100%");
    expect(lastFrame()).not.toContain("░");
  });

  test("handles zero progress", () => {
    const { lastFrame } = render(<ProgressBar current={0} total={10} />);

    expect(lastFrame()).toContain("0%");
    expect(lastFrame()).not.toContain("█");
  });

  test("hides percentage when showPercentage is false", () => {
    const { lastFrame } = render(
      <ProgressBar current={5} total={10} showPercentage={false} />,
    );

    expect(lastFrame()).not.toContain("%");
  });

  test("hides counts when showCounts is false", () => {
    const { lastFrame } = render(
      <ProgressBar current={5} total={10} showCounts={false} />,
    );

    expect(lastFrame()).not.toContain("5/10");
  });

  test("uses custom bar characters", () => {
    const { lastFrame } = render(
      <ProgressBar
        current={5}
        total={10}
        barCompleteChar="▓"
        barIncompleteChar="░"
      />,
    );

    expect(lastFrame()).toContain("▓");
    expect(lastFrame()).toContain("░");
  });
});
