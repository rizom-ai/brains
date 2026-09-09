import { describe, expect, it } from "bun:test";
import { ConsoleLogger } from "@brains/utils/logger";
import {
  CallbackProgressReporter,
  type ProgressNotification,
} from "@brains/utils/progress";
import {
  createJobProgress,
  createPermissionChecker,
} from "../src/internal/authoring-readers";
import { createPluginLogger } from "../src/internal/callback-readers";

describe("authoring capability projections", () => {
  it("keeps progress scaling and detached reporting without exposing heartbeat controls or callbacks", async () => {
    const notifications: ProgressNotification[] = [];
    const host = CallbackProgressReporter.from(async (notification) => {
      notifications.push(notification);
    });
    if (!host) throw new Error("Reporter was not created");
    const scaled = host.createSub({ scale: { start: 10, end: 60 } });
    const progress = createJobProgress(scaled);
    expect(scaled).toHaveProperty("callback");
    expect(scaled).toHaveProperty("startHeartbeat");
    expect(Object.isFrozen(progress)).toBe(true);
    expect(Object.keys(progress)).toEqual(["report"]);
    for (const member of [
      "callback",
      "heartbeatInterval",
      "createSub",
      "startHeartbeat",
      "stopHeartbeat",
      "toCallback",
    ]) {
      expect(progress).not.toHaveProperty(member);
    }
    expect(progress.constructor).not.toHaveProperty("from");
    expect(
      Reflect.set(progress, "callback", async (): Promise<void> => {}),
    ).toBe(false);
    const { report } = progress;
    await report({ progress: 50, total: 100, message: "half" });
    expect(notifications).toEqual([
      { progress: 35, total: 100, message: "half" },
    ]);
    // Runtime owners retain their control surface.
    expect(typeof host.startHeartbeat).toBe("function");
    expect(typeof host.stopHeartbeat).toBe("function");
  });

  it("awaits progress failures rather than swallowing the runtime callback's rejection", async () => {
    const failure = new Error("Progress callback failed");
    const progress = createJobProgress({
      report: async () => {
        throw failure;
      },
    });
    const caught = await progress.report({ progress: 1 }).then(
      () => null,
      (error: unknown) => error,
    );
    expect(caught).toBe(failure);
  });

  it("hides logger storage and factories while retaining bound commands and child logging", () => {
    const host = ConsoleLogger.createFresh({ context: "logger-capability" });
    const logger = createPluginLogger(host);
    expect(host).toHaveProperty("fileHandle");
    expect(host).toHaveProperty("formatEntry");
    expect(host.constructor).toHaveProperty("resetInstance");
    for (const projected of [logger, logger.child("child").child("nested")]) {
      expect(Object.isFrozen(projected)).toBe(true);
      expect(Object.keys(projected).sort()).toEqual([
        "child",
        "debug",
        "error",
        "info",
        "setUseStderr",
        "silly",
        "verbose",
        "warn",
      ]);
      expect(projected).not.toHaveProperty("fileHandle");
      expect(projected).not.toHaveProperty("write");
      expect(projected).not.toHaveProperty("formatEntry");
      expect(projected.constructor).not.toHaveProperty("resetInstance");
      expect(Reflect.set(projected, "fileHandle", 1)).toBe(false);
    }
    const setUseStderr = logger.setUseStderr;
    setUseStderr(true);
    expect(Reflect.get(host, "useStderr")).toBe(true);
    const child = logger.child;
    expect(Object.isFrozen(child("detached"))).toBe(true);
  });
  it("keeps the receiver and permission behavior without exposing host state", () => {
    const host = {
      calls: 0,
      principalsReplaced: false,
      replaceRuntimePrincipalState(): void {
        this.principalsReplaced = true;
      },
      assertEntityActionAllowed(
        _type: string,
        _action: string,
        context: { userPermissionLevel?: string | undefined },
      ): void {
        this.calls++;
        if (context.userPermissionLevel !== "admin") throw new Error("Denied");
      },
    };
    const reader = createPermissionChecker(host);
    const { assertEntityActionAllowed } = reader;
    assertEntityActionAllowed("note", "create", {
      userPermissionLevel: "admin",
    });
    expect(() =>
      assertEntityActionAllowed("note", "create", {
        userPermissionLevel: "public",
      }),
    ).toThrow("Denied");
    expect(host.calls).toBe(2);
    expect(host.principalsReplaced).toBe(false);
    expect(Object.keys(reader)).toEqual(["assertEntityActionAllowed"]);
    expect(Object.getPrototypeOf(reader)).toBe(Object.prototype);
    expect(Object.isFrozen(reader)).toBe(true);
    expect(reader).not.toHaveProperty("replaceRuntimePrincipalState");
    expect(reader).not.toHaveProperty("calls");
    // Host behavior remains available to its legitimate runtime owner.
    host.replaceRuntimePrincipalState();
    expect(host.principalsReplaced).toBe(true);
  });
});
