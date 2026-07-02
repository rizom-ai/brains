import { describe, it, expect } from "bun:test";
import { parseConfirmationResponse } from "../../src/message-interface/confirmation-handler";

describe("parseConfirmationResponse", () => {
  describe("positive confirmations", () => {
    it.each(["yes", "YES", "Yes", "yEs"])(
      'should accept "%s" as confirmed',
      (input) => {
        expect(parseConfirmationResponse(input)).toEqual({ confirmed: true });
      },
    );

    it.each(["y", "Y"])('should accept "%s" as confirmed', (input) => {
      expect(parseConfirmationResponse(input)).toEqual({ confirmed: true });
    });

    it.each(["ok", "OK", "Ok"])('should accept "%s" as confirmed', (input) => {
      expect(parseConfirmationResponse(input)).toEqual({ confirmed: true });
    });

    it.each(["sure", "SURE", "Sure"])(
      'should accept "%s" as confirmed',
      (input) => {
        expect(parseConfirmationResponse(input)).toEqual({ confirmed: true });
      },
    );

    it.each(["proceed", "PROCEED", "Proceed"])(
      'should accept "%s" as confirmed',
      (input) => {
        expect(parseConfirmationResponse(input)).toEqual({ confirmed: true });
      },
    );

    it.each(["confirm", "CONFIRM", "Confirm"])(
      'should accept "%s" as confirmed',
      (input) => {
        expect(parseConfirmationResponse(input)).toEqual({ confirmed: true });
      },
    );

    it.each(["go", "GO", "Go"])('should accept "%s" as confirmed', (input) => {
      expect(parseConfirmationResponse(input)).toEqual({ confirmed: true });
    });
  });

  describe("negative confirmations", () => {
    it.each(["no", "NO", "No"])('should accept "%s" as rejected', (input) => {
      expect(parseConfirmationResponse(input)).toEqual({ confirmed: false });
    });

    it.each(["n", "N"])('should accept "%s" as rejected', (input) => {
      expect(parseConfirmationResponse(input)).toEqual({ confirmed: false });
    });

    it.each(["cancel", "CANCEL", "Cancel"])(
      'should accept "%s" as rejected',
      (input) => {
        expect(parseConfirmationResponse(input)).toEqual({ confirmed: false });
      },
    );

    it.each(["abort", "ABORT", "Abort"])(
      'should accept "%s" as rejected',
      (input) => {
        expect(parseConfirmationResponse(input)).toEqual({ confirmed: false });
      },
    );

    it.each(["stop", "STOP", "Stop"])(
      'should accept "%s" as rejected',
      (input) => {
        expect(parseConfirmationResponse(input)).toEqual({ confirmed: false });
      },
    );

    it.each(["nope", "NOPE", "Nope"])(
      'should accept "%s" as rejected',
      (input) => {
        expect(parseConfirmationResponse(input)).toEqual({ confirmed: false });
      },
    );
  });

  describe("edge cases", () => {
    it("should trim leading whitespace", () => {
      expect(parseConfirmationResponse("  yes")).toEqual({ confirmed: true });
      expect(parseConfirmationResponse("\tno")).toEqual({ confirmed: false });
    });

    it("should trim trailing whitespace", () => {
      expect(parseConfirmationResponse("yes  ")).toEqual({ confirmed: true });
      expect(parseConfirmationResponse("no\n")).toEqual({ confirmed: false });
    });

    it("should trim both leading and trailing whitespace", () => {
      expect(parseConfirmationResponse("  yes  ")).toEqual({ confirmed: true });
      expect(parseConfirmationResponse("\t no \n")).toEqual({
        confirmed: false,
      });
    });

    it("should return undefined for unrecognized input", () => {
      expect(parseConfirmationResponse("maybe")).toBeUndefined();
      expect(parseConfirmationResponse("hello")).toBeUndefined();
      expect(parseConfirmationResponse("yesss")).toBeUndefined();
      expect(parseConfirmationResponse("noo")).toBeUndefined();
    });

    it("should return undefined for empty input", () => {
      expect(parseConfirmationResponse("")).toBeUndefined();
      expect(parseConfirmationResponse("   ")).toBeUndefined();
      expect(parseConfirmationResponse("\t\n")).toBeUndefined();
    });
  });
});
