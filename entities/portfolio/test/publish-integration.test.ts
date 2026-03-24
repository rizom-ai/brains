import { describe, it, expect, beforeEach } from "bun:test";
import { PortfolioPlugin } from "../src/plugin";
import {
  createPluginHarness,
  type PluginTestHarness,
} from "@brains/plugins/test";
import type { Project } from "../src/schemas/project";

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
  let harness: PluginTestHarness<PortfolioPlugin>;
  let receivedMessages: Array<{ type: string; payload: unknown }>;

  beforeEach(async () => {
    harness = createPluginHarness<PortfolioPlugin>({
      dataDir: "/tmp/test-portfolio",
    });
    receivedMessages = [];

    for (const eventType of [
      "publish:register",
      "publish:report:success",
      "publish:report:failure",
    ]) {
      harness.subscribe(eventType, async (msg) => {
        receivedMessages.push({ type: eventType, payload: msg.payload });
        return { success: true };
      });
    }
  });

  describe("provider registration", () => {
    it("should send publish:register message on init with internal provider", async () => {
      await harness.installPlugin(new PortfolioPlugin({}));

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
      await harness.installPlugin(new PortfolioPlugin({}));

      await harness.sendMessage("publish:execute", {
        entityType: "project",
        entityId: "non-existent",
      });

      const failureMessage = receivedMessages.find(
        (m) => m.type === "publish:report:failure",
      );
      expect(failureMessage).toBeDefined();
    });

    it("should report failure when entity not found", async () => {
      await harness.installPlugin(new PortfolioPlugin({}));

      await harness.sendMessage("publish:execute", {
        entityType: "project",
        entityId: "non-existent",
      });

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
      await harness.installPlugin(new PortfolioPlugin({}));

      await harness.sendMessage("publish:execute", {
        entityType: "post",
        entityId: "post-1",
      });

      const reportMessages = receivedMessages.filter((m) =>
        m.type.startsWith("publish:report"),
      );
      expect(reportMessages).toHaveLength(0);
    });

    it("should report success when publishing draft project", async () => {
      await harness.installPlugin(new PortfolioPlugin({}));

      const entityService = harness.getEntityService();
      await entityService.createEntity(sampleDraftProject);

      await harness.sendMessage("publish:execute", {
        entityType: "project",
        entityId: "project-1",
      });

      const successMessage = receivedMessages.find(
        (m) => m.type === "publish:report:success",
      );
      expect(successMessage).toBeDefined();
      expect(successMessage?.payload).toMatchObject({
        entityType: "project",
        entityId: "project-1",
      });

      const updatedProject = await entityService.getEntity<Project>(
        "project",
        "project-1",
      );
      expect(updatedProject?.metadata.status).toBe("published");
      expect(updatedProject?.metadata.publishedAt).toBeDefined();
    });

    it("should skip already published projects", async () => {
      await harness.installPlugin(new PortfolioPlugin({}));

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
      const entityService = harness.getEntityService();
      await entityService.createEntity(publishedProject);

      await harness.sendMessage("publish:execute", {
        entityType: "project",
        entityId: "project-1",
      });

      const reportMessages = receivedMessages.filter((m) =>
        m.type.startsWith("publish:report"),
      );
      expect(reportMessages).toHaveLength(0);
    });
  });
});
