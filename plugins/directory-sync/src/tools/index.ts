import type { PluginTool, ToolContext, ToolResponse } from "@brains/plugins";
import type { DirectorySync } from "../lib/directory-sync";
import type { ServicePluginContext } from "@brains/plugins";
import { z } from "@brains/utils";
import { createId } from "@brains/plugins";

export function createDirectorySyncTools(
  directorySync: DirectorySync,
  pluginContext: ServicePluginContext,
  pluginId: string,
): PluginTool[] {
  return [
    {
      name: `${pluginId}:sync`,
      description: "Synchronize all entities with directory (async)",
      inputSchema: {},
      visibility: "anchor",
      handler: async (
        _input: unknown,
        context: ToolContext,
      ): Promise<ToolResponse> => {
        const source = context.channelId
          ? `${context.interfaceType}:${context.channelId}`
          : `plugin:${pluginId}`;

        const metadata: {
          progressToken?: string;
          pluginId?: string;
        } = {
          pluginId,
        };

        const progressToken = context.progressToken?.toString();
        if (progressToken !== undefined) {
          metadata.progressToken = progressToken;
        }

        const result = await directorySync.queueSyncBatch(
          pluginContext,
          source,
          metadata,
        );

        if (!result) {
          return {
            status: "completed",
            message: "No operations needed - no entity types or files to sync",
            batchId: `empty-sync-${Date.now()}`,
          };
        }

        return {
          status: "queued",
          message: `Sync batch operation queued: ${result.exportOperationsCount} export jobs, ${result.importOperationsCount} import jobs for ${result.totalFiles} files`,
          batchId: result.batchId,
          exportOperations: result.exportOperationsCount,
          importOperations: result.importOperationsCount,
          totalFiles: result.totalFiles,
          tip: "Use the status tool to check progress of this batch operation",
        };
      },
    },
    {
      name: `${pluginId}:export`,
      description: "Export entities to directory (async batch operation)",
      inputSchema: {
        entityTypes: z
          .array(z.string())
          .optional()
          .describe("Specific entity types to export (optional)"),
        batchSize: z
          .number()
          .min(1)
          .default(100)
          .describe("Number of entities to process per batch"),
      },
      visibility: "anchor",
      handler: async (
        input: unknown,
        context: ToolContext,
      ): Promise<ToolResponse> => {
        const params = input as {
          entityTypes?: string[];
          batchSize?: number;
        };

        const typesToExport =
          params.entityTypes ?? pluginContext.entityService.getEntityTypes();

        const operations = typesToExport.map((entityType) => ({
          type: "directory-export",
          data: {
            entityTypes: [entityType],
            batchSize: params.batchSize ?? 100,
          },
        }));

        if (operations.length === 0) {
          return {
            status: "completed",
            message: "No entity types to export",
            batchId: `empty-export-${Date.now()}`,
          };
        }

        const batchId = await pluginContext.enqueueBatch(operations, {
          source: `plugin:${pluginId}`,
          metadata: {
            rootJobId: createId(),
            progressToken: context.progressToken,
            operationType: "file_operations",
            pluginId,
          },
        });

        return {
          status: "queued",
          message: `Export batch operation queued for ${operations.length} entity types`,
          batchId,
          entityTypes: typesToExport,
          tip: "Use the status tool to check progress of this batch operation",
        };
      },
    },
    {
      name: `${pluginId}:import`,
      description: "Import entities from directory (async batch operation)",
      inputSchema: {
        paths: z
          .array(z.string())
          .optional()
          .describe("Specific file paths to import (optional)"),
        batchSize: z
          .number()
          .min(1)
          .default(50)
          .describe("Number of files to process per batch"),
      },
      visibility: "anchor",
      handler: async (
        input: unknown,
        context: ToolContext,
      ): Promise<ToolResponse> => {
        const importSchema = z.object({
          paths: z.array(z.string()).optional(),
          batchSize: z.number().min(1).default(50),
        });
        const params = importSchema.parse(input);

        const filesToImport =
          params.paths ?? directorySync.getAllMarkdownFiles();
        const batchSize = params.batchSize;

        const batches: string[][] = [];
        for (let i = 0; i < filesToImport.length; i += batchSize) {
          batches.push(filesToImport.slice(i, i + batchSize));
        }

        if (batches.length === 0) {
          return {
            status: "completed",
            message: "No files to import",
            batchId: `empty-import-${Date.now()}`,
          };
        }

        const operations = batches.map((batchPaths, index) => ({
          type: "directory-import",
          data: {
            batchIndex: index,
            paths: batchPaths,
            batchSize: batchPaths.length,
          },
        }));

        const batchId = await pluginContext.enqueueBatch(operations, {
          source: `plugin:${pluginId}`,
          metadata: {
            rootJobId: createId(),
            progressToken: context.progressToken,
            operationType: "file_operations",
            pluginId,
          },
        });

        return {
          status: "queued",
          message: `Import batch operation queued for ${filesToImport.length} files in ${batches.length} batches`,
          batchId,
          totalFiles: filesToImport.length,
          totalBatches: batches.length,
          tip: "Use the status tool to check progress of this batch operation",
        };
      },
    },
    {
      name: `${pluginId}:watch`,
      description: "Start or stop directory watching",
      inputSchema: {
        action: z.enum(["start", "stop"]),
      },
      visibility: "anchor",
      handler: async (input: unknown): Promise<{ watching: boolean }> => {
        const watchSchema = z.object({
          action: z.enum(["start", "stop"]),
        });
        const params = watchSchema.parse(input);

        if (params.action === "start") {
          void directorySync.startWatching();
        } else {
          directorySync.stopWatching();
        }

        const status = await directorySync.getStatus();
        return { watching: status.watching };
      },
    },
    {
      name: `${pluginId}:status`,
      description: "Get directory sync status",
      inputSchema: {},
      visibility: "public",
      handler: async (
        _input: unknown,
        _context: ToolContext,
      ): Promise<ToolResponse> => {
        const status = await directorySync.getStatus();
        return { ...status };
      },
    },
    {
      name: `${pluginId}:ensure-structure`,
      description: "Ensure directory structure exists for all entity types",
      inputSchema: {},
      visibility: "anchor",
      handler: async (): Promise<{ message: string }> => {
        await directorySync.ensureDirectoryStructure();
        return { message: "Directory structure created" };
      },
    },
  ];
}
