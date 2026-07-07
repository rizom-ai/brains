import { describe, expect, it } from "bun:test";
import { parseConfirmationResponse } from "./confirmation-response";

describe("parseConfirmationResponse", () => {
  it("recognizes explicit positive and negative confirmation replies", () => {
    expect(parseConfirmationResponse("yes")).toEqual({ confirmed: true });
    expect(parseConfirmationResponse("  OK  ")).toEqual({ confirmed: true });
    expect(parseConfirmationResponse("no")).toEqual({ confirmed: false });
    expect(parseConfirmationResponse("\tcancel\n")).toEqual({
      confirmed: false,
    });
  });

  it("leaves ordinary messages unclassified", () => {
    expect(
      parseConfirmationResponse("actually tell me about Rover"),
    ).toBeUndefined();
    expect(parseConfirmationResponse("")).toBeUndefined();
  });
});
