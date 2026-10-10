import { describe, expect, it } from "bun:test";
import { expectBodyRoundTrip } from "@brains/test-utils";
import { openingTemplate } from "../src/opening";
import { askRoomTemplate } from "../src/ask-room";
import { askedTemplate } from "../src/asked";

describe("authored site copy codecs", () => {
  it.each([
    ["opening", openingTemplate, "# Network\n\n## Kicker\nMeasured locally\n"],
    [
      "Ask room",
      askRoomTemplate,
      "# Ask\n\n## Cap\nAsk\n\n## Claim\nAsk *anything*\n\n## Body\nAnswers with sources\n",
    ],
    [
      "asked",
      askedTemplate,
      "# Asked before\n\n## Cap\nEarlier questions\n\n## Claim\nKept answers\n\n## Body\nGrounded in authored content\n",
    ],
  ] as const)("round-trips decoded %s copy", (_name, template, markdown) => {
    const formatter = template.overlayFormatter;
    expect(formatter).toBeDefined();
    if (!formatter) throw new Error("Missing copy formatter");
    expectBodyRoundTrip(formatter, formatter.parse(markdown));
  });
});
