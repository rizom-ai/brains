import type { ServicePlugin, ServicePluginContext, PluginCapabilities } from "../src";

/**
 * Example Note Service Plugin
 * Tests ServicePluginContext capabilities:
 * - Everything from Core (messaging, templates, logging)
 * - Content generation with AI
 * - Entity service access
 * - Job queue operations
 */
export const noteServicePlugin: ServicePlugin = {
  id: "note-service",
  version: "1.0.0",
  type: "service",
  description: "Note management plugin demonstrating Service plugin capabilities",

  async register(context: ServicePluginContext): Promise<PluginCapabilities> {
    // Test template registration
    context.registerTemplates({
      "note-summary": {
        name: "note-summary",
        description: "Generate note summary",
        generate: async (data: { title: string; content: string }) => {
          return `# ${data.title}\n\n${data.content}`;
        },
      },
      "note-created": {
        name: "note-created",
        description: "Format note creation message",
        generate: async (data: { id: string; title: string; timestamp: string }) => {
          return `✨ Note "${data.title}" created with ID: ${data.id} at ${data.timestamp}`;
        },
      },
    });

    // Test messaging - subscribe to note requests
    context.subscribe(
      "note:create",
      async (message: {
        id?: string;
        payload?: { title: string; content: string };
      }) => {
        context.logger.info("Creating note", message);

        const { title, content } = message.payload || {};
        
        // Use entity service to create note
        const note = await context.entityService.createEntity({
          entityType: "note",
          title,
          content,
          tags: [],
        });

        // Send result back via messaging
        await context.sendMessage("note:created", {
          requestId: message.id,
          noteId: note.id,
          title: note.title,
        });

        return { success: true, noteId: note.id };
      },
    );

    // Test content generation with AI
    const summary = await context.generateContent({
      templateName: "note-summary",
      prompt: "Summarize the key points",
      data: {
        title: "Meeting Notes",
        content: "Discussed project timeline and deliverables",
      },
    });
    context.logger.info("Generated summary:", summary);

    // Test job queue operations
    context.registerJobHandler("process-note", async (job) => {
      context.logger.info("Processing note job", { jobId: job.id, data: job.data });
      // Simulate note processing
      return { processed: true };
    });

    context.logger.info(
      "Note service plugin registered with all ServicePluginContext features tested",
    );

    // Return capabilities
    return {
      tools: [
        {
          name: "note_create",
          description: "Create a new note",
          inputSchema: {
            type: "object",
            properties: {
              title: { type: "string" },
              content: { type: "string" },
              tags: { type: "array", items: { type: "string" } },
            },
            required: ["title", "content"],
          },
          handler: async (input: any) => {
            const note = await context.entityService.createEntity({
              entityType: "note",
              ...input,
            });
            return { noteId: note.id, title: note.title };
          },
        },
        {
          name: "note_search",
          description: "Search notes by query",
          inputSchema: {
            type: "object",
            properties: {
              query: { type: "string" },
              limit: { type: "number" },
            },
            required: ["query"],
          },
          handler: async (input: any) => {
            const results = await context.entityService.searchEntities({
              entityType: "note",
              query: input.query,
              limit: input.limit || 10,
            });
            return results;
          },
        },
      ],
      resources: [
        {
          uri: "note://recent",
          name: "Recent Notes",
          description: "Get recently created notes",
          mimeType: "application/json",
          handler: async () => {
            const notes = await context.entityService.listEntities({
              entityType: "note",
              limit: 10,
              orderBy: "createdAt",
              orderDirection: "desc",
            });
            return {
              contents: notes.entities.map((note) => ({
                text: JSON.stringify(note),
                uri: `note://${note.id}`,
                mimeType: "application/json",
              })),
            };
          },
        },
      ],
      commands: [
        {
          name: "note:create",
          description: "Create a new note",
          usage: "note:create <title> <content>",
          handler: async (args) => {
            const [title, ...contentParts] = args;
            const content = contentParts.join(" ");
            
            if (!title || !content) {
              return "Error: Please provide both title and content";
            }
            
            const note = await context.entityService.createEntity({
              entityType: "note",
              title,
              content,
              tags: [],
            });
            
            // Test content formatting
            return context.formatContent("note-created", {
              id: note.id,
              title: note.title,
              timestamp: new Date().toISOString(),
            });
          },
        },
        {
          name: "note:summarize",
          description: "Generate AI summary of a note",
          usage: "note:summarize <noteId>",
          handler: async (args) => {
            const [noteId] = args;
            if (!noteId) {
              return "Error: Please provide a note ID";
            }
            
            const note = await context.entityService.getEntity("note", noteId);
            if (!note) {
              return "Error: Note not found";
            }
            
            // Use AI content generation
            const summary = await context.generateContent({
              templateName: "note-summary",
              prompt: `Summarize this note: ${note.content}`,
              data: { title: note.title, content: note.content },
            });
            
            return summary as string;
          },
        },
      ],
    };
  },
};