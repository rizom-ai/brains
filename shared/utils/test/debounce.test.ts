import { describe, it, expect } from "bun:test";
import { LeadingTrailingDebounce, TrailingDebounce } from "../src/debounce";

describe("TrailingDebounce", () => {
  it("does not fire before the quiet window elapses", async () => {
    let calls = 0;
    const debounce = new TrailingDebounce(() => calls++, 40);

    debounce.trigger();
    expect(calls).toBe(0);

    await new Promise((r) => setTimeout(r, 80));
    expect(calls).toBe(1);
  });

  it("collapses rapid triggers into one trailing call", async () => {
    let calls = 0;
    const debounce = new TrailingDebounce(() => calls++, 40);

    debounce.trigger();
    debounce.trigger();
    debounce.trigger();
    await new Promise((r) => setTimeout(r, 80));

    expect(calls).toBe(1);
  });

  it("resets the window on each trigger", async () => {
    let calls = 0;
    const debounce = new TrailingDebounce(() => calls++, 50);

    debounce.trigger();
    await new Promise((r) => setTimeout(r, 30));
    debounce.trigger();
    await new Promise((r) => setTimeout(r, 30));
    // 60ms since the first trigger, but only 30ms since the last one.
    expect(calls).toBe(0);

    await new Promise((r) => setTimeout(r, 40));
    expect(calls).toBe(1);
  });

  it("cancels on dispose", async () => {
    let calls = 0;
    const debounce = new TrailingDebounce(() => calls++, 30);

    debounce.trigger();
    debounce.dispose();
    await new Promise((r) => setTimeout(r, 60));

    expect(calls).toBe(0);
  });
});

describe("LeadingTrailingDebounce", () => {
  it("fires immediately on the first trigger", () => {
    let calls = 0;
    const debounce = new LeadingTrailingDebounce(() => calls++, 40);

    debounce.trigger();
    expect(calls).toBe(1);
  });

  it("fires a trailing call only when extra triggers arrived", async () => {
    let calls = 0;
    const debounce = new LeadingTrailingDebounce(() => calls++, 40);

    debounce.trigger();
    debounce.trigger();
    await new Promise((r) => setTimeout(r, 80));

    expect(calls).toBe(2);
  });
});
