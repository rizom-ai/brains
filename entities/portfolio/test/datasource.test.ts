import { describe, it, expect, beforeEach, spyOn } from "bun:test";
import { ProjectDataSource } from "../src/datasources/project-datasource";
import { PortfolioPlugin } from "../src/plugin";
import { createPluginHarness } from "@brains/plugins/test";
import type { Project } from "../src/schemas/project";
import type { BaseDataSourceContext } from "@brains/plugins";
import type { Logger } from "@brains/utils/logger";
import { z } from "@brains/utils/zod";
import {
  createMockLogger,
  createMockShell,
  createTestEntity,
} from "@brains/test-utils";
import type { MockShell } from "@brains/test-utils";

describe("ProjectDataSource", () => {
  let datasource: ProjectDataSource;
  let shell: MockShell;
  let mockLogger: Logger;
  let mockContext: BaseDataSourceContext;

  // Helper to create mock project entities
  const createMockProject = (
    id: string,
    title: string,
    slug: string,
    status: "draft" | "published",
    year: number,
  ): Project => {
    const content = `---
title: ${title}
slug: ${slug}
status: ${status}
description: Description for ${title}
year: ${year}
---

## Context
Context for ${title}

## Problem
Problem for ${title}

## Solution
Solution for ${title}

## Outcome
Outcome for ${title}`;
    return createTestEntity<Project>("project", {
      id,
      content,
      metadata: {
        title,
        slug,
        status,
        year,
      },
    });
  };

  beforeEach(() => {
    mockLogger = createMockLogger();
    shell = createMockShell();
    mockContext = { entityService: shell.getEntityService() };

    datasource = new ProjectDataSource(mockLogger);
  });

  describe("fetchProjectList", () => {
    const listSchema = z.object({
      projects: z.array(z.any()),
      pagination: z.any().nullable(),
    });

    it("accepts datasource output before site URL enrichment", async () => {
      shell.addEntities([
        createMockProject(
          "proj-1",
          "Published Project",
          "published-project",
          "published",
          2024,
        ),
      ]);

      const harness = createPluginHarness({
        dataDir: "/tmp/test-portfolio-template-schema",
      });
      try {
        await harness.installPlugin(new PortfolioPlugin({}));
        const templateSchema = harness
          .getTemplates()
          .get("portfolio:project-list")?.schema;
        if (!templateSchema)
          throw new Error("portfolio:project-list template not found");

        const result = await datasource.fetch(
          { entityType: "project", query: { page: 1, pageSize: 10 } },
          templateSchema,
          mockContext,
        );
        const parsed = listSchema.parse(result);

        expect(parsed.projects).toHaveLength(1);
        expect(parsed.projects[0]?.url).toBeNull();
        expect(parsed.projects[0]?.typeLabel).toBeNull();
        expect(
          z.looseObject({ baseUrl: z.null() }).parse(result).baseUrl,
        ).toBeNull();
        expect(JSON.parse(JSON.stringify(result))).toStrictEqual(result);
      } finally {
        harness.reset();
      }
    });

    it("should sort projects by year desc then title asc", async () => {
      shell.addEntities([
        createMockProject("proj-1", "Zeta Project", "zeta", "published", 2023),
        createMockProject("proj-2", "Beta Project", "beta", "published", 2024),
        createMockProject(
          "proj-3",
          "Alpha Project",
          "alpha",
          "published",
          2024,
        ),
      ]);

      const result = await datasource.fetch(
        { entityType: "project" },
        listSchema,
        mockContext,
      );

      expect(result.projects.map((p: { id: string }) => p.id)).toEqual([
        "proj-3",
        "proj-2",
        "proj-1",
      ]);
    });

    it("should not scope to published itself — filtering is content-service's job", async () => {
      // The runtime hands datasources a pre-scoped entityService. The contract
      // here is delegation: the datasource must not pass publishedOnly, or it
      // would double-filter previews.
      shell.addEntities([
        createMockProject(
          "proj-1",
          "Published Project",
          "published-project",
          "published",
          2024,
        ),
        createMockProject(
          "proj-2",
          "Draft Project",
          "draft-project",
          "draft",
          2024,
        ),
      ]);
      const listSpy = spyOn(shell.getEntityService(), "listEntities");

      const result = await datasource.fetch(
        { entityType: "project" },
        listSchema,
        mockContext,
      );

      // Unscoped service returns drafts too: the datasource passed no filter.
      expect(result.projects).toHaveLength(2);
      const statuses = result.projects.map(
        (p: { metadata: { status: string } }) => p.metadata.status,
      );
      expect(statuses).toContain("published");
      expect(statuses).toContain("draft");
      const options = listSpy.mock.calls[0]?.[0]?.options ?? {};
      expect("publishedOnly" in options).toBe(false);
    });
  });

  describe("fetchSingleProject", () => {
    const detailSchema = z.object({
      project: z.any(),
      prevProject: z.any().nullable(),
      nextProject: z.any().nullable(),
    });

    it("should include draft projects in prev/next when context entityService returns all", async () => {
      // Sort order: year desc, title asc →
      // proj-3 (2024 Draft Project), proj-2 (2024 Published 2024), proj-1 (2023)
      shell.addEntities([
        createMockProject(
          "proj-1",
          "Published 2023",
          "published-2023",
          "published",
          2023,
        ),
        createMockProject(
          "proj-2",
          "Published 2024",
          "published-2024",
          "published",
          2024,
        ),
        createMockProject(
          "proj-3",
          "Draft Project",
          "draft-project",
          "draft",
          2024,
        ),
      ]);

      const result = await datasource.fetch(
        { entityType: "project", query: { id: "published-2023" } },
        detailSchema,
        mockContext,
      );

      expect(result.project.id).toBe("proj-1");
      // proj-1 is last in sort order, so prev is proj-2, next is null
      expect(result.prevProject?.id).toBe("proj-2");
      expect(result.nextProject).toBeNull();
    });

    it("should navigate between the visible projects only", async () => {
      // With only published projects seeded (as a scoped service would
      // return), navigation spans exactly those.
      shell.addEntities([
        createMockProject(
          "proj-2",
          "Middle Project",
          "middle-project",
          "published",
          2024,
        ),
        createMockProject(
          "proj-1",
          "Published 2023",
          "published-2023",
          "published",
          2023,
        ),
      ]);

      const result = await datasource.fetch(
        { entityType: "project", query: { id: "middle-project" } },
        detailSchema,
        mockContext,
      );

      expect(result.project.id).toBe("proj-2");
      // Sorted by year desc: proj-2 (2024) first, proj-1 (2023) second
      expect(result.prevProject).toBeNull();
      expect(result.nextProject?.id).toBe("proj-1");
    });

    it("should render project detail data even when body headings are not structured", async () => {
      shell.addEntities([
        createTestEntity<Project>("project", {
          id: "city-pulse",
          content: `---
title: CityPulse
slug: city-pulse
status: published
description: Real-time urban data dashboard
year: 2025
ogImageId: og-project-city-pulse
---
# CityPulse

A public dashboard for urban sensor data.

## The problem

Sensor data was scattered across vendor silos.

## What we built

A normalized public data API and dashboard.`,
          metadata: {
            title: "CityPulse",
            slug: "city-pulse",
            status: "published",
            year: 2025,
          },
        }),
      ]);

      const result = await datasource.fetch(
        { entityType: "project", query: { id: "city-pulse" } },
        detailSchema,
        mockContext,
      );

      expect(result.project.id).toBe("city-pulse");
      expect(result.project.structuredContent).toBeUndefined();
      expect(result.project.frontmatter.ogImageId).toBe(
        "og-project-city-pulse",
      );
    });
  });

  describe("metadata", () => {
    it("should have correct datasource ID", () => {
      expect(datasource.id).toBe("portfolio:entities");
    });

    it("should have descriptive name and description", () => {
      expect(datasource.name).toBe("Portfolio Project DataSource");
      expect(datasource.description).toContain("project entities");
    });
  });

  describe("coverImageId in frontmatter (for site-builder enrichment)", () => {
    // Note: coverImageUrl is resolved centrally by site-builder's enrichWithUrls,
    // not by the datasource. The datasource passes through entity data including
    // content field with coverImageId in frontmatter.
    const listSchema = z.object({
      projects: z.array(z.any()),
      pagination: z.any().nullable(),
    });

    // Helper to create mock project with coverImageId
    const createMockProjectWithCover = (
      id: string,
      title: string,
      slug: string,
      coverImageId: string,
    ): Project => {
      const content = `---
title: ${title}
slug: ${slug}
status: published
description: Description for ${title}
year: 2024
coverImageId: ${coverImageId}
---

## Context
Context for ${title}

## Problem
Problem for ${title}

## Solution
Solution for ${title}

## Outcome
Outcome for ${title}`;
      return createTestEntity<Project>("project", {
        id,
        content,
        metadata: {
          title,
          slug,
          status: "published",
          year: 2024,
        },
      });
    };

    it("should include coverImageId in frontmatter for site-builder enrichment", async () => {
      shell.addEntities([
        createMockProjectWithCover(
          "proj-1",
          "Project with Cover",
          "project-with-cover",
          "project-cover-image",
        ),
      ]);

      const result = await datasource.fetch(
        { entityType: "project" },
        listSchema,
        mockContext,
      );

      expect(result.projects).toHaveLength(1);
      // Frontmatter should include coverImageId for site-builder to resolve
      expect(result.projects[0].frontmatter.coverImageId).toBe(
        "project-cover-image",
      );
      // Entity content is preserved for site-builder enrichment
      expect(result.projects[0].content).toContain(
        "coverImageId: project-cover-image",
      );
    });

    it("should not include coverImageId when not in frontmatter", async () => {
      shell.addEntities([
        createMockProject(
          "proj-1",
          "Project without Cover",
          "project-without-cover",
          "published",
          2024,
        ),
      ]);

      const result = await datasource.fetch(
        { entityType: "project" },
        listSchema,
        mockContext,
      );

      expect(result.projects).toHaveLength(1);
      expect(result.projects[0].frontmatter.coverImageId).toBeNull();
    });
  });
});
