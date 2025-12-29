import { describe, it, expect, beforeEach } from "bun:test";
import {
  parseConfirmationResponse,
  formatConfirmationPrompt,
  ConfirmationTracker,
} from "../../src/message-interface/confirmation-handler";

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

describe("formatConfirmationPrompt", () => {
  it("should include the action description", () => {
    const prompt = formatConfirmationPrompt("Delete all notes?");
    expect(prompt).toContain("Delete all notes?");
  });

  it("should include help text with valid responses", () => {
    const prompt = formatConfirmationPrompt("Publish this content?");
    expect(prompt.toLowerCase()).toMatch(/yes/);
    expect(prompt.toLowerCase()).toMatch(/no|cancel/);
  });

  it("should format as markdown", () => {
    const prompt = formatConfirmationPrompt("Delete this?");
    // Should have some markdown formatting (bold, italic, etc.)
    expect(prompt).toMatch(/\*\*|\*/);
  });
});

describe("ConfirmationTracker", () => {
  let tracker: ConfirmationTracker;

  beforeEach(() => {
    tracker = new ConfirmationTracker();
  });

  describe("setPending and getPending", () => {
    it("should store and retrieve pending confirmation", () => {
      const confirmation = {
        toolName: "delete_note",
        description: "Delete note 'My Note'",
        args: { id: "note-123" },
      };

      tracker.setPending("conv-1", confirmation);

      expect(tracker.getPending("conv-1")).toEqual(confirmation);
    });

    it("should return undefined for non-existent conversation", () => {
      expect(tracker.getPending("non-existent")).toBeUndefined();
    });

    it("should overwrite existing confirmation for same conversation", () => {
      const first = {
        toolName: "delete_note",
        description: "First",
        args: {},
      };
      const second = {
        toolName: "publish",
        description: "Second",
        args: {},
      };

      tracker.setPending("conv-1", first);
      tracker.setPending("conv-1", second);

      expect(tracker.getPending("conv-1")).toEqual(second);
    });
  });

  describe("clearPending", () => {
    it("should remove pending confirmation", () => {
      tracker.setPending("conv-1", {
        toolName: "delete",
        description: "Delete",
        args: {},
      });

      tracker.clearPending("conv-1");

      expect(tracker.getPending("conv-1")).toBeUndefined();
    });

    it("should not throw when clearing non-existent conversation", () => {
      expect(() => tracker.clearPending("non-existent")).not.toThrow();
    });
  });

  describe("isPending", () => {
    it("should return true when confirmation is pending", () => {
      tracker.setPending("conv-1", {
        toolName: "delete",
        description: "Delete",
        args: {},
      });

      expect(tracker.isPending("conv-1")).toBe(true);
    });

    it("should return false when no confirmation is pending", () => {
      expect(tracker.isPending("conv-1")).toBe(false);
    });

    it("should return false after clearing", () => {
      tracker.setPending("conv-1", {
        toolName: "delete",
        description: "Delete",
        args: {},
      });
      tracker.clearPending("conv-1");

      expect(tracker.isPending("conv-1")).toBe(false);
    });
  });

  describe("multiple conversations", () => {
    it("should track confirmations independently per conversation", () => {
      const conf1 = { toolName: "delete", description: "Delete 1", args: {} };
      const conf2 = { toolName: "publish", description: "Publish 2", args: {} };

      tracker.setPending("conv-1", conf1);
      tracker.setPending("conv-2", conf2);

      expect(tracker.getPending("conv-1")).toEqual(conf1);
      expect(tracker.getPending("conv-2")).toEqual(conf2);
      expect(tracker.isPending("conv-1")).toBe(true);
      expect(tracker.isPending("conv-2")).toBe(true);
    });

    it("should clear only the specified conversation", () => {
      tracker.setPending("conv-1", {
        toolName: "a",
        description: "A",
        args: {},
      });
      tracker.setPending("conv-2", {
        toolName: "b",
        description: "B",
        args: {},
      });

      tracker.clearPending("conv-1");

      expect(tracker.isPending("conv-1")).toBe(false);
      expect(tracker.isPending("conv-2")).toBe(true);
    });
  });
});
