import { describe, it, expect } from "bun:test";
import { extractDomain } from "../src/lib/fetch-agent-card";

describe("extractDomain", () => {
  it("should extract domain from https URL", () => {
    expect(extractDomain("https://yeehaa.io")).toBe("yeehaa.io");
  });

  it("should extract domain from http URL", () => {
    expect(extractDomain("http://yeehaa.io")).toBe("yeehaa.io");
  });

  it("should return bare domain as-is", () => {
    expect(extractDomain("yeehaa.io")).toBe("yeehaa.io");
  });

  it("should extract URL from natural language prompt", () => {
    expect(
      extractDomain(
        "Create an agent entry for the remote agent at URL https://yeehaa.io.",
      ),
    ).toBe("yeehaa.io");
  });

  it("should extract URL from prompt with trailing text", () => {
    expect(
      extractDomain("Add the agent at https://rover.rizom.ai to my directory"),
    ).toBe("rover.rizom.ai");
  });

  it("should extract http URL from prompt", () => {
    expect(extractDomain("check http://localhost:3333 please")).toBe(
      "localhost",
    );
  });

  it("should return empty string for empty input", () => {
    expect(extractDomain("")).toBe("");
  });

  it("should return empty string for prompt with no URL or domain", () => {
    expect(extractDomain("create an agent")).toBe("");
  });
});
