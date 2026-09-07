import * as stylex from "@stylexjs/stylex";

const SECONDARY_SIZE = "24px";
const SECONDARY_WEIGHT = 500;
const SECONDARY_LEADING = 1.2;
const SECONDARY_TRACKING = "-0.02em";
const SECTION_SIZE = "14px";
const SECTION_WEIGHT = 650;
const UI_FONT = "var(--console-ui)";
const EYEBROW_SIZE = "10px";
const EYEBROW_WEIGHT = 600;
const EYEBROW_TRACKING = "0.12em";

/** Shared Studio type roles; layout and semantic colors stay with each surface. */
export const typographyStyles: Record<
  "secondaryDisplay" | "section" | "operatorRoles" | "eyebrow",
  stylex.StyleXStyles
> = stylex.create({
  secondaryDisplay: {
    fontFamily: "var(--console-display)",
    fontVariationSettings: '"SOFT" 70,"opsz" 40',
    fontSize: SECONDARY_SIZE,
    fontWeight: SECONDARY_WEIGHT,
    lineHeight: SECONDARY_LEADING,
    letterSpacing: SECONDARY_TRACKING,
  },
  section: {
    fontFamily: UI_FONT,
    fontSize: SECTION_SIZE,
    fontWeight: SECTION_WEIGHT,
  },
  operatorRoles: {
    fontFamily: UI_FONT,
    "--operator-secondary-size": SECONDARY_SIZE,
    "--operator-secondary-weight": `${SECONDARY_WEIGHT}`,
    "--operator-secondary-leading": `${SECONDARY_LEADING}`,
    "--operator-secondary-tracking": SECONDARY_TRACKING,
    "--operator-section-family": UI_FONT,
    "--operator-section-size": SECTION_SIZE,
    "--operator-section-weight": `${SECTION_WEIGHT}`,
    "--operator-eyebrow-size": EYEBROW_SIZE,
    "--operator-eyebrow-weight": `${EYEBROW_WEIGHT}`,
    "--operator-eyebrow-tracking": EYEBROW_TRACKING,
  },
  eyebrow: {
    fontFamily: "var(--console-mono)",
    fontSize: EYEBROW_SIZE,
    fontWeight: EYEBROW_WEIGHT,
    letterSpacing: EYEBROW_TRACKING,
    textTransform: "uppercase",
  },
});
