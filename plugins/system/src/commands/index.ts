import type { Command, CommandResponse } from "@brains/plugins";
import type { ISystemPlugin } from "../types";

export function createSystemCommands(
  plugin: ISystemPlugin,
  _pluginId: string,
): Command[] {
  return [
    {
      name: "search",
      description: "Search your knowledge base",
      usage: "/search <query>",
      visibility: "public",
      handler: async (args, _context): Promise<CommandResponse> => {
        if (args.length === 0) {
          return {
            type: "message",
            message: "Please provide a search query. Usage: /search <query>",
          };
        }

        const searchQuery = args.join(" ");

        try {
          const searchResults = await plugin.searchEntities(searchQuery, {
            limit: 5,
            sortBy: "relevance",
          });

          if (searchResults.length === 0) {
            return {
              type: "message",
              message: `No results found for "${searchQuery}"`,
            };
          }

          // Format search results
          const formatted = searchResults
            .map((result) => {
              const entity = result.entity;
              const preview =
                entity.content.substring(0, 200) +
                (entity.content.length > 200 ? "..." : "");

              return [
                `**${entity.metadata?.["title"] ?? entity.id}**`,
                `Type: ${entity.entityType} | Score: ${result.score.toFixed(2)}`,
                ``,
                preview,
              ].join("\n");
            })
            .join("\n\n---\n\n");

          return {
            type: "message",
            message: `Found ${searchResults.length} results for "${searchQuery}":\n\n${formatted}`,
          };
        } catch (error) {
          return {
            type: "message",
            message: `Error searching entities: ${error instanceof Error ? error.message : String(error)}`,
          };
        }
      },
    },
    {
      name: "get",
      description: "Get a specific entity by ID",
      usage: "/get <entity-id> [entity-type]",
      visibility: "public",
      handler: async (args, _context): Promise<CommandResponse> => {
        if (args.length === 0) {
          return {
            type: "message",
            message:
              "Please provide an entity ID. Usage: /get <entity-id> [entity-type]",
          };
        }

        const entityId = args[0] as string;
        const entityType = args[1] ?? "base";

        try {
          const entity = await plugin.getEntity(entityType, entityId);

          if (!entity) {
            return {
              type: "message",
              message: `Entity not found: ${entityId} (type: ${entityType})`,
            };
          }

          // Format entity as a readable string
          const formatted = [
            `ID: ${entity.id}`,
            `Type: ${entity.entityType}`,
            `Title: ${entity.metadata?.["title"] ?? "Untitled"}`,
            `Created: ${new Date(entity.created).toLocaleString()}`,
            `Updated: ${new Date(entity.updated).toLocaleString()}`,
            ``,
            `Content:`,
            entity.content,
          ].join("\n");

          return {
            type: "message",
            message: formatted,
          };
        } catch (error) {
          return {
            type: "message",
            message: `Error getting entity: ${error instanceof Error ? error.message : String(error)}`,
          };
        }
      },
    },
    {
      name: "get-job-status",
      description: "Check the status of background operations",
      usage: "/getjobstatus [batch-id]",
      handler: async (args, _context): Promise<CommandResponse> => {
        const batchId = args[0];

        try {
          const status = await plugin.getJobStatus(batchId);

          if (batchId) {
            // Specific batch status
            if (!status.batch) {
              return {
                type: "message",
                message: `Batch not found: ${batchId}`,
              };
            }

            const percentComplete =
              status.batch.totalOperations > 0
                ? Math.round(
                    (status.batch.completedOperations /
                      status.batch.totalOperations) *
                      100,
                  )
                : 0;

            return {
              type: "message",
              message: [
                `Batch ID: ${status.batch.batchId}`,
                `Status: ${status.batch.status}`,
                `Progress: ${percentComplete}% (${status.batch.completedOperations}/${status.batch.totalOperations})`,
                `Failed: ${status.batch.failedOperations}`,
              ].join("\n"),
            };
          } else {
            // All active operations
            const activeJobs = status.activeJobs ?? [];
            const activeBatches = status.activeBatches ?? [];

            const formattedJobs = activeJobs.map((job) => ({
              id: job.id,
              type: job.type,
              status: job.status,
              priority:
                job.priority === 0
                  ? "normal"
                  : job.priority === 1
                    ? "high"
                    : "low",
            }));

            const formattedBatches = activeBatches.map((batch) => ({
              batchId: batch.batchId,
              totalOperations: batch.status.totalOperations,
              completedOperations: batch.status.completedOperations,
              failedOperations: batch.status.failedOperations,
              status: batch.status.status,
              percentComplete:
                batch.status.totalOperations > 0
                  ? Math.round(
                      (batch.status.completedOperations /
                        batch.status.totalOperations) *
                        100,
                    )
                  : 0,
            }));

            const sections = [];

            if (formattedJobs.length > 0) {
              sections.push("Active Jobs:");
              formattedJobs.forEach((job) => {
                sections.push(`  ${job.id} - ${job.type} (${job.status})`);
              });
            }

            if (formattedBatches.length > 0) {
              if (sections.length > 0) sections.push("");
              sections.push("Active Batches:");
              formattedBatches.forEach((batch) => {
                sections.push(
                  `  ${batch.batchId} - ${batch.percentComplete}% complete (${batch.completedOperations}/${batch.totalOperations})`,
                );
              });
              sections.push("");
              sections.push(
                "Tip: Use /getjobstatus <batch-id> to check specific batch progress",
              );
            }

            if (sections.length === 0) {
              return {
                type: "message",
                message: "No active operations",
              };
            }

            return {
              type: "message",
              message: sections.join("\n"),
            };
          }
        } catch (error) {
          return {
            type: "message",
            message: `Error getting job status: ${error instanceof Error ? error.message : String(error)}`,
          };
        }
      },
    },
    {
      name: "get-conversation",
      description: "Get conversation details",
      usage: "/getconversation <conversation-id>",
      handler: async (args, _context): Promise<CommandResponse> => {
        if (args.length === 0) {
          return {
            type: "message",
            message:
              "Please provide a conversation ID. Usage: /getconversation <conversation-id>",
          };
        }

        const conversationId = args[0] as string;

        try {
          // Get conversation details only
          const conversation = await plugin.getConversation(conversationId);

          if (!conversation) {
            return {
              type: "message",
              message: `Conversation not found: ${conversationId}`,
            };
          }

          // Format the response with metadata only
          const sections = [
            `**Conversation: ${conversation.id}**`,
            `Interface: ${conversation.interfaceType}`,
            `Channel: ${conversation.channelId}`,
            `Created: ${new Date(conversation.created).toLocaleString()}`,
            `Last Active: ${new Date(conversation.lastActive).toLocaleString()}`,
            ``,
            `Tip: Use /getmessages ${conversationId} to see messages`,
          ];

          return {
            type: "message",
            message: sections.join("\n"),
          };
        } catch (error) {
          return {
            type: "message",
            message: `Error getting conversation: ${error instanceof Error ? error.message : String(error)}`,
          };
        }
      },
    },
    {
      name: "list-conversations",
      description: "List all conversations or search by query",
      usage: "/listconversations [search-query]",
      handler: async (args, _context): Promise<CommandResponse> => {
        const searchQuery = args.join(" ");

        try {
          const conversations = await plugin.searchConversations(searchQuery);

          if (conversations.length === 0) {
            return {
              type: "message",
              message: searchQuery
                ? `No conversations found matching: ${searchQuery}`
                : "No conversations found",
            };
          }

          // Group by interface type
          const grouped = conversations.reduce(
            (acc, conv) => {
              const interfaceType = conv.interfaceType;
              acc[interfaceType] ??= [];
              acc[interfaceType].push(conv);
              return acc;
            },
            {} as Record<string, typeof conversations>,
          );

          const sections = [
            `Found ${conversations.length} conversation${conversations.length === 1 ? "" : "s"}:`,
            "",
          ];

          Object.entries(grouped).forEach(([interfaceType, convs]) => {
            sections.push(`**${interfaceType} (${convs.length}):**`);
            convs.slice(0, 5).forEach((conv) => {
              const lastActive = new Date(conv.lastActive).toLocaleString();
              sections.push(
                `  • ${conv.id} [${conv.channelId}] - Last: ${lastActive}`,
              );
            });
            if (convs.length > 5) {
              sections.push(`  ... and ${convs.length - 5} more`);
            }
            sections.push("");
          });

          sections.push(
            "Tip: Use /getconversation <id> to see details and messages",
          );

          return {
            type: "message",
            message: sections.join("\n"),
          };
        } catch (error) {
          return {
            type: "message",
            message: `Error listing conversations: ${error instanceof Error ? error.message : String(error)}`,
          };
        }
      },
    },
    {
      name: "get-messages",
      description: "Get messages from a conversation",
      usage: "/getmessages <conversation-id> [limit]",
      handler: async (args, _context): Promise<CommandResponse> => {
        if (args.length === 0) {
          return {
            type: "message",
            message:
              "Please provide a conversation ID. Usage: /getmessages <conversation-id> [limit]",
          };
        }

        const conversationId = args[0] as string;
        const limit = args[1] ? parseInt(args[1] as string, 10) : 20;

        try {
          const messages = await plugin.getMessages(conversationId, limit);

          if (messages.length === 0) {
            return {
              type: "message",
              message: `No messages found in conversation: ${conversationId}`,
            };
          }

          // Format messages
          const sections = [
            `**Messages from ${conversationId} (${messages.length}/${limit} requested):**`,
            "",
          ];

          messages.forEach((msg, index) => {
            sections.push(
              `${index + 1}. [${msg.role.toUpperCase()}] ${new Date(msg.timestamp).toLocaleString()}`,
              msg.content,
              "---",
            );
          });

          return {
            type: "message",
            message: sections.join("\n"),
          };
        } catch (error) {
          return {
            type: "message",
            message: `Error getting messages: ${error instanceof Error ? error.message : String(error)}`,
          };
        }
      },
    },
    {
      name: "identity",
      description: "View the brain's identity (role, purpose, values)",
      usage: "/identity",
      visibility: "public",
      handler: async (_args, _context): Promise<CommandResponse> => {
        try {
          // Get identity from context
          const identity = plugin.getIdentityData();

          // Format as plain markdown
          const sections = [
            "# Brain Identity",
            "",
            "## Role",
            identity.role || "Not set",
            "",
            "## Purpose",
            identity.purpose || "Not set",
            "",
            "## Values",
          ];

          if (identity.values && identity.values.length > 0) {
            identity.values.forEach((value) => {
              sections.push(`- ${value}`);
            });
          } else {
            sections.push("Not set");
          }

          return {
            type: "message",
            message: sections.join("\n"),
          };
        } catch (error) {
          return {
            type: "message",
            message: `Error getting identity: ${error instanceof Error ? error.message : String(error)}`,
          };
        }
      },
    },
    {
      name: "status",
      description: "View system status and access information",
      usage: "/status",
      visibility: "public",
      handler: async (_args, _context): Promise<CommandResponse> => {
        try {
          const appInfo = await plugin.getAppInfo();
          const sections: string[] = [];

          // Title
          sections.push("# System Status");
          sections.push("");

          // Model and version
          sections.push(`**Model**: ${appInfo.model} v${appInfo.version}`);
          sections.push("");

          // Plugins
          if (appInfo.plugins && appInfo.plugins.length > 0) {
            sections.push("## Plugins");
            sections.push("");

            for (const plugin of appInfo.plugins) {
              const statusIcon =
                plugin.status === "initialized"
                  ? "✓"
                  : plugin.status === "error"
                    ? "✗"
                    : "○";
              sections.push(
                `${statusIcon} **${plugin.id}** (${plugin.type}) v${plugin.version}`,
              );
            }
            sections.push("");
          }

          // Access points (interfaces)
          if (appInfo.interfaces && appInfo.interfaces.length > 0) {
            sections.push("## Interfaces");
            sections.push("");

            for (const daemon of appInfo.interfaces) {
              const isHealthy =
                daemon.status === "running" &&
                daemon.health?.status === "healthy";
              const icon = isHealthy ? "✓" : "✗";
              const message = daemon.health?.message || daemon.status;

              // Capitalize first letter
              const name =
                daemon.name.charAt(0).toUpperCase() + daemon.name.slice(1);

              sections.push(`${icon} **${name}**: ${message}`);
            }
          }

          return {
            type: "message",
            message: sections.join("\n"),
          };
        } catch (error) {
          return {
            type: "message",
            message: `Error getting system status: ${error instanceof Error ? error.message : String(error)}`,
          };
        }
      },
    },
  ];
}
