import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { PortfolioPlugin } from "../src/plugin";
import { createSilentLogger } from "@brains/test-utils";
import { MockShell } from "@brains/plugins/test";
import type { Project } from "../src/schemas/project";

// Sample project for testing
const sampleDraftProject: Project = {
  id: "project-1",
  entityType: "project",
  content: `---
title: Test Project
slug: test-project
status: draft
description: A test project
year: 2024
---

## Context

This is the context.

## Problem

This is the problem.

## Solution

This is the solution.

## Outcome

This is the outcome.`,
  metadata: {
    title: "Test Project",
    slug: "test-project",
    status: "draft",
    year: 2024,
  },
  contentHash: "abc123",
  created: "2024-01-01T00:00:00Z",
  updated: "2024-01-01T00:00:00Z",
};

describe("PortfolioPlugin - Publish Pipeline Integration", () => {
  let plugin: PortfolioPlugin;
  let mockShell: MockShell;
  let logger: ReturnType<typeof createSilentLogger>;
  let receivedMessages: Array<{ type: string; payload: unknown }>;

  beforeEach(async () => {
    logger = createSilentLogger();
    mockShell = MockShell.createFresh({
      logger,
      dataDir: "/tmp/test-portfolio",
    });
    receivedMessages = [];

    // Capture publish messages
    const messageBus = mockShell.getMessageBus();
    messageBus.subscribe("publish:register", async (msg) => {
      receivedMessages.push({ type: "publish:register", payload: msg.payload });
      return { success: true };
    });
    messageBus.subscribe("publish:report:success", async (msg) => {
      receivedMessages.push({
        type: "publish:report:success",
        payload: msg.payload,
      });
      return { success: true };
    });
    messageBus.subscribe("publish:report:failure", async (msg) => {
      receivedMessages.push({
        type: "publish:report:failure",
        payload: msg.payload,
      });
      return { success: true };
    });
  });

  afterEach(async () => {
    mock.restore();
  });

  describe("provider registration", () => {
    it("should send publish:register message on init with internal provider", async () => {
      plugin = new PortfolioPlugin({});
      await plugin.register(mockShell);

      const registerMessage = receivedMessages.find(
        (m) => m.type === "publish:register",
      );
      expect(registerMessage).toBeDefined();
      expect(registerMessage?.payload).toMatchObject({
        entityType: "project",
        provider: { name: "internal" },
      });
    });
  });

  describe("publish:execute handler", () => {
    it("should subscribe to publish:execute messages", async () => {
      plugin = new PortfolioPlugin({});
      await plugin.register(mockShell);

      const messageBus = mockShell.getMessageBus();
      const response = await messageBus.send(
        "publish:execute",
        { entityType: "project", entityId: "non-existent" },
        "test",
      );

      expect(response).toMatchObject({ success: true });
    });

    it("should report failure when entity not found", async () => {
      plugin = new PortfolioPlugin({});
      await plugin.register(mockShell);

      const messageBus = mockShell.getMessageBus();
      await messageBus.send(
        "publish:execute",
        { entityType: "project", entityId: "non-existent" },
        "test",
      );

      const failureMessage = receivedMessages.find(
        (m) => m.type === "publish:report:failure",
      );
      expect(failureMessage).toBeDefined();
      expect(failureMessage?.payload).toMatchObject({
        entityType: "project",
        entityId: "non-existent",
      });
    });

    it("should skip non-project entity types", async () => {
      plugin = new PortfolioPlugin({});
      await plugin.register(mockShell);

      const messageBus = mockShell.getMessageBus();
      await messageBus.send(
        "publish:execute",
        { entityType: "post", entityId: "post-1" },
        "test",
      );

      // No report messages for other entity types
      const reportMessages = receivedMessages.filter((m) =>
        m.type.startsWith("publish:report"),
      );
      expect(reportMessages).toHaveLength(0);
    });

    it("should report success when publishing draft project", async () => {
      plugin = new PortfolioPlugin({});
      await plugin.register(mockShell);

      // Add draft project
      const entityService = mockShell.getEntityService();
      await entityService.createEntity(sampleDraftProject);

      const messageBus = mockShell.getMessageBus();
      await messageBus.send(
        "publish:execute",
        { entityType: "project", entityId: "project-1" },
        "test",
      );

      const successMessage = receivedMessages.find(
        (m) => m.type === "publish:report:success",
      );
      expect(successMessage).toBeDefined();
      expect(successMessage?.payload).toMatchObject({
        entityType: "project",
        entityId: "project-1",
      });

      // Verify project was updated to published
      const updatedProject = await entityService.getEntity<Project>(
        "project",
        "project-1",
      );
      expect(updatedProject?.metadata.status).toBe("published");
      expect(updatedProject?.metadata.publishedAt).toBeDefined();
    });

    it("should skip already published projects", async () => {
      plugin = new PortfolioPlugin({});
      await plugin.register(mockShell);

      // Add published project
      const publishedProject: Project = {
        ...sampleDraftProject,
        content: sampleDraftProject.content.replace(
          "status: draft",
          "status: published\npublishedAt: '2024-01-01T00:00:00Z'",
        ),
        metadata: {
          ...sampleDraftProject.metadata,
          status: "published",
          publishedAt: "2024-01-01T00:00:00Z",
        },
      };
      const entityService = mockShell.getEntityService();
      await entityService.createEntity(publishedProject);

      const messageBus = mockShell.getMessageBus();
      await messageBus.send(
        "publish:execute",
        { entityType: "project", entityId: "project-1" },
        "test",
      );

      // No report messages for already published
      const reportMessages = receivedMessages.filter((m) =>
        m.type.startsWith("publish:report"),
      );
      expect(reportMessages).toHaveLength(0);
    });
  });
});
