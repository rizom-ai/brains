import { describe, expect, it } from "bun:test";
import { buildShellConfig, toAppConfig } from "../src/app";

describe("app HTTP host configuration", () => {
  it("uses one production port for the listener and local advertising", () => {
    const config = buildShellConfig(
      toAppConfig({
        deployment: { ports: { production: 9000 } },
        http: { preview: false },
      }),
    );
    expect(config.localSiteUrl).toBe("http://localhost:9000");
    expect(config.http).toEqual({ port: 9000, preview: false });
  });
  it("does not silently override the deployment port through shell config", () => {
    const config = buildShellConfig(
      toAppConfig({
        deployment: { ports: { production: 9000 } },
        shellConfig: { http: { port: 8080 } },
      }),
    );
    expect(config.http?.port).toBe(9000);
    expect(config.localSiteUrl).toBe("http://localhost:9000");
  });
});
