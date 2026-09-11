import * as stylex from "@stylexjs/stylex";

export const formLayoutStyles: Record<"form" | "submit", stylex.StyleXStyles> =
  stylex.create({
    form: {
      display: "grid",
      gridTemplateColumns: {
        default: "repeat(2, minmax(0, 1fr))",
        "@media (max-width: 640px)": "minmax(0, 1fr)",
        "@container operator-aside (min-width: 0px)": "minmax(0, 1fr)",
      },
      gap: 12,
      width: {
        default: "min(720px, 100%)",
        "@container operator-aside (min-width: 0px)": "100%",
      },
      minWidth: 0,
      maxWidth: "100%",
      boxSizing: "border-box",
    },
    submit: { alignSelf: "end", justifySelf: "start" },
  });
