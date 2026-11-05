import { describe, expect, it } from "bun:test";
import * as stylex from "@stylexjs/stylex";
import { toneFill, toneText } from "../src";
// A shared tone must compile to the classes every console surface already
// emitted for the same declaration.
import { reference as local } from "./tone-reference.styles";

describe("console tones", () => {
  it("colours text in the tone's semantic colour", () => {
    expect(stylex.props(toneText("good")).className).toBe(
      stylex.props(local.goodText).className,
    );
    expect(stylex.props(toneText("warn")).className).toBe(
      stylex.props(local.warnText).className,
    );
    expect(stylex.props(toneText("error")).className).toBe(
      stylex.props(local.errorText).className,
    );
  });

  it("fills marks in the tone's semantic colour", () => {
    expect(stylex.props(toneFill("good")).className).toBe(
      stylex.props(local.goodFill).className,
    );
    expect(stylex.props(toneFill("error")).className).toBe(
      stylex.props(local.errorFill).className,
    );
  });

  it("leaves neutral and missing tones to the surface's own colour", () => {
    expect(toneText("neutral")).toBe(false);
    expect(toneText(undefined)).toBe(false);
    expect(toneFill("neutral")).toBe(false);
  });
});
