import { describe, it, expect, mock } from "bun:test";
import { MatrixInterface } from "../src/matrix-interface";
import { matrixConfig } from "../src/config";
import type { InterfaceContext } from "@brains/interface-core";
import { createTestLogger } from "@brains/utils";

describe("MatrixInterface", () => {
  const mockContext: InterfaceContext = {
    name: "matrix",
    version: "1.0.0",
    logger: createTestLogger(),
    processQuery: mock(async () => "Mock response"),
  };

  describe("Basic functionality", () => {
    it("should create interface with valid config", () => {
      const config = matrixConfig()
        .homeserver("https://matrix.example.org")
        .accessToken("test-token")
        .userId("@bot:example.org")
        .anchorUserId("@admin:example.org")
        .build();

      const matrixInterface = new MatrixInterface(mockContext, config);
      expect(matrixInterface).toBeDefined();
    });
  });
});
