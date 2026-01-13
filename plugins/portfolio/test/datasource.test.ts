import { describe, it, expect, beforeEach, spyOn } from "bun:test";
import { ProjectDataSource } from "../src/datasources/project-datasource";
import type { Project } from "../src/schemas/project";
import type { IEntityService, BaseDataSourceContext } from "@brains/plugins";
import type { Logger } from "@brains/utils";
import { z } from "@brains/utils";
import {
  createMockLogger,
  createMockEntityService,
  createTestEntity,
} from "@brains/test-utils";

describe("ProjectDataSource", () => {
  let datasource: ProjectDataSource;
  let mockEntityService: IEntityService;
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
    mockEntityService = createMockEntityService();
    mockContext = {};

    datasource = new ProjectDataSource(mockEntityService, mockLogger);
  });

  describe("fetchProjectList", () => {
    const listSchema = z.object({
      projects: z.array(z.any()),
      pagination: z.any().nullable(),
    });

    it("should show only published projects when publishedOnly is true", async () => {
      // When publishedOnly is true, entity service filters at database level
      // Mock returns only published projects (simulating entity service filtering)
      const publishedProjects: Project[] = [
        createMockProject(
          "proj-1",
          "Published Project",
          "published-project",
          "published",
          2024,
        ),
        createMockProject(
          "proj-3",
          "Another Published",
          "another-published",
          "published",
          2023,
        ),
      ];

      spyOn(mockEntityService, "listEntities").mockResolvedValue(
        publishedProjects,
      );

      const result = await datasource.fetch(
        { entityType: "project" },
        listSchema,
        { ...mockContext, publishedOnly: true },
      );

      expect(result.projects).toHaveLength(2);
      expect(
        result.projects.every(
          (p: { metadata: { status: string } }) =>
            p.metadata.status === "published",
        ),
      ).toBe(true);

      // Verify sortFields and publishedOnly were passed to entity service
      // Default limit is 10, offset is 0 when no pagination specified
      expect(mockEntityService.listEntities).toHaveBeenCalledWith("project", {
        limit: 10,
        offset: 0,
        sortFields: [
          { field: "year", direction: "desc" },
          { field: "title", direction: "asc" },
        ],
        publishedOnly: true,
      });
    });

    it("should show all projects (including drafts) when publishedOnly is false", async () => {
      // When publishedOnly is false, entity service returns all projects
      const projects: Project[] = [
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
        createMockProject(
          "proj-3",
          "Another Draft",
          "another-draft",
          "draft",
          2023,
        ),
      ];

      spyOn(mockEntityService, "listEntities").mockResolvedValue(projects);

      const result = await datasource.fetch(
        { entityType: "project" },
        listSchema,
        { ...mockContext, publishedOnly: false },
      );

      expect(result.projects).toHaveLength(3);
      // Verify we have both published and draft projects
      const statuses = result.projects.map(
        (p: { metadata: { status: string } }) => p.metadata.status,
      );
      expect(statuses).toContain("published");
      expect(statuses).toContain("draft");

      // Verify sortFields and publishedOnly: false was passed to entity service
      // Default limit is 10, offset is 0 when no pagination specified
      expect(mockEntityService.listEntities).toHaveBeenCalledWith("project", {
        limit: 10,
        offset: 0,
        sortFields: [
          { field: "year", direction: "desc" },
          { field: "title", direction: "asc" },
        ],
        publishedOnly: false,
      });
    });
  });

  describe("fetchSingleProject", () => {
    const detailSchema = z.object({
      project: z.any(),
      prevProject: z.any().nullable(),
      nextProject: z.any().nullable(),
    });

    it("should include draft projects in prev/next when publishedOnly is false", async () => {
      // Sort order: by year desc, then title asc
      // So: proj-2 (2024 Published), proj-3 (2024 Draft), proj-1 (2023 Published)
      const targetProject = createMockProject(
        "proj-1",
        "Published 2023",
        "published-2023",
        "published",
        2023,
      );

      // DB returns sorted by year desc, title asc
      const allProjectsSorted: Project[] = [
        createMockProject(
          "proj-3",
          "Draft Project",
          "draft-project",
          "draft",
          2024,
        ),
        createMockProject(
          "proj-2",
          "Published 2024",
          "published-2024",
          "published",
          2024,
        ),
        targetProject,
      ];

      // First call: fetch by slug, Second call: fetch all for navigation
      spyOn(mockEntityService, "listEntities")
        .mockResolvedValueOnce([targetProject])
        .mockResolvedValueOnce(allProjectsSorted);

      const result = await datasource.fetch(
        { entityType: "project", query: { id: "published-2023" } },
        detailSchema,
        { ...mockContext, publishedOnly: false },
      );

      expect(result.project.id).toBe("proj-1");
      // Sorted by year desc, title asc: proj-3 (2024), proj-2 (2024), proj-1 (2023)
      // proj-1 is last, so prev is proj-2, next is null
      expect(result.prevProject?.id).toBe("proj-2");
      expect(result.nextProject).toBeNull();
    });

    it("should exclude draft projects from prev/next when publishedOnly is true", async () => {
      const targetProject = createMockProject(
        "proj-2",
        "Middle Project",
        "middle-project",
        "published",
        2024,
      );

      // When publishedOnly is true, DB returns only published projects
      // Sorted by year desc, title asc
      const publishedProjectsSorted: Project[] = [
        targetProject, // 2024
        createMockProject(
          "proj-1",
          "Published 2023",
          "published-2023",
          "published",
          2023,
        ),
      ];

      // First call: fetch by slug, Second call: fetch all for navigation
      spyOn(mockEntityService, "listEntities")
        .mockResolvedValueOnce([targetProject])
        .mockResolvedValueOnce(publishedProjectsSorted);

      const result = await datasource.fetch(
        { entityType: "project", query: { id: "middle-project" } },
        detailSchema,
        { ...mockContext, publishedOnly: true },
      );

      expect(result.project.id).toBe("proj-2");
      // Sorted by year desc: proj-2 (2024) is first, proj-1 (2023) is second
      // proj-2 is first, so prev is null, next is proj-1
      expect(result.prevProject).toBeNull();
      expect(result.nextProject?.id).toBe("proj-1");
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
      const projectWithCover = createMockProjectWithCover(
        "proj-1",
        "Project with Cover",
        "project-with-cover",
        "project-cover-image",
      );

      spyOn(mockEntityService, "listEntities").mockResolvedValue([
        projectWithCover,
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
      const projectWithoutCover = createMockProject(
        "proj-1",
        "Project without Cover",
        "project-without-cover",
        "published",
        2024,
      );

      spyOn(mockEntityService, "listEntities").mockResolvedValue([
        projectWithoutCover,
      ]);

      const result = await datasource.fetch(
        { entityType: "project" },
        listSchema,
        mockContext,
      );

      expect(result.projects).toHaveLength(1);
      expect(result.projects[0].frontmatter.coverImageId).toBeUndefined();
    });
  });
});
