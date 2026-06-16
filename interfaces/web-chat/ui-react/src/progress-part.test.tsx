import { describe, expect, it } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { isProgressData, ProgressPart, progressLabel } from "./App";

describe("ProgressPart", () => {
  it("renders completed and failed progress with semantic status labels", () => {
    expect(progressLabel("pending")).toBe("queued");
    expect(progressLabel("processing")).toBe("processing");
    expect(progressLabel("completed")).toBe("completed");
    expect(progressLabel("failed")).toBe("failed");

    const completed = renderToStaticMarkup(
      createElement(ProgressPart, {
        data: {
          status: "completed",
          operationType: "site_build",
          operationTarget: "preview",
          message: "Preview build finished",
          progress: { current: 12, total: 12, percentage: 100 },
        },
      }),
    );

    expect(completed).toContain('data-status="completed"');
    expect(completed).toContain("completed");
    expect(completed).toContain("site build: preview");
    expect(completed).toContain("Preview build finished");
    expect(completed).toContain("100% complete");

    const failed = renderToStaticMarkup(
      createElement(ProgressPart, {
        data: {
          status: "failed",
          operationType: "upload_import",
          message: "PDF extraction failed",
        },
      }),
    );

    expect(failed).toContain('data-status="failed"');
    expect(failed).toContain("failed");
    expect(failed).toContain("upload import");
    expect(failed).toContain("PDF extraction failed");
  });

  it("rejects malformed progress data instead of rendering raw payloads", () => {
    expect(isProgressData(null)).toBe(false);
    expect(
      isProgressData({ status: "weird", operationType: "site_build" }),
    ).toBe(false);
    expect(isProgressData({ status: "processing" })).toBe(false);

    expect(
      renderToStaticMarkup(
        createElement(ProgressPart, {
          data: {
            status: "weird",
            operationType: "site_build",
            message: "do not render me",
          },
        }),
      ),
    ).not.toContain("do not render me");
  });
});
