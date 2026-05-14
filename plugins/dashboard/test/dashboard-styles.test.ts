import { describe, expect, it } from "bun:test";
import { DASHBOARD_STYLES } from "../src/render/styles";

describe("DASHBOARD_STYLES", () => {
  it("should avoid dark inverse background tokens in dashboard light mode", () => {
    const lightModeBlock = DASHBOARD_STYLES.match(
      /\[data-theme="light"\] \{(?<body>[\s\S]*?)\n\}/,
    )?.groups?.["body"];

    expect(lightModeBlock).toBeDefined();
    expect(lightModeBlock).toContain("--dashboard-bg-deep");
    expect(lightModeBlock).toContain("--color-bg-deep");
    expect(lightModeBlock).toContain("--color-bg-subtle");
    expect(lightModeBlock).not.toContain("--color-bg-dark");
  });
});
