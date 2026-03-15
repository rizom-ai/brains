import { describe, it, expect, beforeEach } from "bun:test";
import { TaskManager } from "../src/task-manager";

describe("TaskManager", () => {
  let tm: TaskManager;

  beforeEach(() => {
    tm = new TaskManager();
  });

  describe("createTask", () => {
    it("should create a task with submitted state", () => {
      const record = tm.createTask("Hello");
      expect(record.task.status.state).toBe("submitted");
      expect(record.task.history).toHaveLength(1);
      expect(record.conversationId).toStartWith("a2a:");
    });

    it("should use provided contextId", () => {
      const record = tm.createTask("Hello", "ctx-123");
      expect(record.task.contextId).toBe("ctx-123");
    });

    it("should generate contextId when not provided", () => {
      const record = tm.createTask("Hello");
      expect(record.task.contextId).toBeDefined();
    });
  });

  describe("updateState", () => {
    it("should update task state", () => {
      const record = tm.createTask("Hello");
      const updated = tm.updateState(record.task.id, "working");
      expect(updated?.task.status.state).toBe("working");
    });

    it("should add agent message when text is provided", () => {
      const record = tm.createTask("Hello");
      tm.updateState(record.task.id, "completed", "Done!");
      expect(record.task.history).toHaveLength(2);
      expect(record.task.status.message?.role).toBe("agent");
    });

    it("should return undefined for unknown task", () => {
      expect(tm.updateState("nonexistent", "working")).toBeUndefined();
    });
  });

  describe("eviction", () => {
    it("should evict terminal tasks after TTL expires", () => {
      const tm = new TaskManager(0); // 0ms TTL — immediate eviction

      const record = tm.createTask("First");
      tm.updateState(record.task.id, "completed", "Done");

      // Creating a new task triggers eviction
      tm.createTask("Second");

      expect(tm.getTask(record.task.id)).toBeUndefined();
      expect(tm.size).toBe(1);
    });

    it("should not evict tasks still within TTL", () => {
      const tm = new TaskManager(60_000); // 1 minute TTL

      const record = tm.createTask("First");
      tm.updateState(record.task.id, "completed", "Done");

      tm.createTask("Second");

      expect(tm.getTask(record.task.id)).toBeDefined();
      expect(tm.size).toBe(2);
    });

    it("should not evict tasks in non-terminal states", () => {
      const tm = new TaskManager(0);

      const record = tm.createTask("First");
      tm.updateState(record.task.id, "working");

      tm.createTask("Second");

      expect(tm.getTask(record.task.id)).toBeDefined();
      expect(tm.size).toBe(2);
    });

    it("should evict multiple expired tasks at once", () => {
      const tm = new TaskManager(0);

      const r1 = tm.createTask("One");
      tm.updateState(r1.task.id, "completed", "Done");
      const r2 = tm.createTask("Two");
      tm.updateState(r2.task.id, "failed", "Error");

      // Third task triggers eviction of both
      tm.createTask("Three");

      expect(tm.getTask(r1.task.id)).toBeUndefined();
      expect(tm.getTask(r2.task.id)).toBeUndefined();
      expect(tm.size).toBe(1);
    });
  });
});
