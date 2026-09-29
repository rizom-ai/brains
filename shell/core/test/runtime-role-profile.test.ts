import { describe, expect, it } from "bun:test";
import { runtimeRoleProfile } from "../src/runtime-process-role";

describe("runtimeRoleProfile", () => {
  it("serves and schedules in the web process, executing nothing", () => {
    expect(runtimeRoleProfile("web")).toEqual({
      endpointRole: "owner",
      serves: true,
      executes: false,
      handlerRegistrationMode: "validation-only",
      progressMonitorMode: "durable-reader",
      projectionActivation: "scheduler",
    });
  });

  it("executes in the worker process, serving nothing", () => {
    expect(runtimeRoleProfile("worker")).toEqual({
      endpointRole: "client",
      serves: false,
      executes: true,
      handlerRegistrationMode: "execution-only",
      progressMonitorMode: "durable-writer",
      projectionActivation: "executor",
    });
  });

  it("does both in a single process", () => {
    expect(runtimeRoleProfile(undefined)).toEqual({
      endpointRole: "none",
      serves: true,
      executes: true,
      handlerRegistrationMode: "combined",
      progressMonitorMode: "combined",
      projectionActivation: "scheduler",
    });
  });
});
