import {
  internalFullScope,
  permissionToVisibilityScope,
} from "@brains/plugins";
import type {
  BaseEntity,
  InboxActor,
  InboxItem,
  InboxItemDetail,
  InboxSource,
  ServicePluginContext,
} from "@brains/plugins";
import { quizResultAdapter } from "./entity/adapter";
import {
  quizResultMetadataSchema,
  quizResultSchema,
  type QuizResult,
  type QuizResultFrontmatter,
} from "./entity/schema";

type QuizInboxContext = Pick<ServicePluginContext, "entityService"> & {
  permissions: Pick<
    ServicePluginContext["permissions"],
    "assertEntityActionAllowed"
  >;
};

function requireAdmin(actor: InboxActor): void {
  if (actor.permissionLevel !== "admin")
    throw new Error("Quiz inbox requires admin permission");
}

function parse(entity: BaseEntity | null): {
  entity: QuizResult;
  frontmatter: QuizResultFrontmatter;
} {
  const parsed = quizResultSchema.parse(entity);
  return { entity: parsed, ...quizResultAdapter.parseContent(parsed.content) };
}

/** What the owner reads in the Inbox: who took which quiz, how to reach
 * them, their results and their answers. */
function detail(frontmatter: QuizResultFrontmatter): string {
  const lines = [
    `Quiz: ${frontmatter.quiz}`,
    ...(frontmatter.name ? [`Name: ${frontmatter.name}`] : []),
    ...(frontmatter.email ? [`Email: ${frontmatter.email}`] : []),
    ...(frontmatter.language ? [`Language: ${frontmatter.language}`] : []),
    "",
    ...frontmatter.results.map(
      (result) => `${result.title}: ${result.outcomeTitle}`,
    ),
    "",
    ...frontmatter.answers.map(
      (answer) =>
        `${answer.label}: ${Array.isArray(answer.value) ? answer.value.join(", ") : answer.value}`,
    ),
  ];
  return lines.join("\n");
}

/**
 * A quiz result is a to-do only when its taker left a way to answer them;
 * every result is in Studio. Registry listing is an internal pull
 * operation; details and mutations check the actor here.
 */
export class QuizInboxSource implements InboxSource {
  readonly sourceId: string = "quiz-results";
  readonly displayName: string = "Quiz results";
  private readonly context: QuizInboxContext;

  constructor(context: QuizInboxContext) {
    this.context = context;
  }

  async list(): Promise<InboxItem[]> {
    try {
      const entities = await this.context.entityService.listEntities(
        {
          entityType: "quiz-result",
          options: {
            limit: 1000,
            sortFields: [{ field: "receivedAt", direction: "desc" }],
            filter: {
              visibilityScope: internalFullScope("quiz inbox is admin-only"),
              metadata: { status: "new", contact: true },
            },
          },
        },
        quizResultSchema,
      );
      return entities.flatMap((entity): InboxItem[] => {
        const { frontmatter } = quizResultAdapter.parseContent(entity.content);
        if (frontmatter.status !== "new" || !frontmatter.email) return [];
        return [
          {
            id: entity.id,
            title: `${entity.metadata.title} result`,
            summary: frontmatter.results
              .map((result) => `${result.title}: ${result.outcomeTitle}`)
              .join(" · "),
            receivedAt: frontmatter.receivedAt,
            urgency: "normal",
            entityRef: { entityType: "quiz-result", entityId: entity.id },
            actions: [{ id: "mark-handled", label: "Done" }],
          },
        ];
      });
    } catch {
      // Inbox error reporting must not echo private content or backend details.
      throw new Error("Quiz inbox unavailable");
    }
  }

  async resolveDetail(
    itemId: string,
    actor: InboxActor,
    signal: AbortSignal,
  ): Promise<InboxItemDetail> {
    requireAdmin(actor);
    signal.throwIfAborted();
    try {
      const entity = await this.read(itemId, actor);
      signal.throwIfAborted();
      return {
        kind: "plain",
        text: detail(parse(entity).frontmatter),
        truncated: false,
      };
    } catch {
      signal.throwIfAborted();
      throw new Error("Quiz result unavailable");
    }
  }

  async act(
    itemId: string,
    actionId: string,
    actor: InboxActor,
  ): Promise<void> {
    requireAdmin(actor);
    if (actionId !== "mark-handled")
      throw new Error("Invalid quiz inbox action");
    this.context.permissions.assertEntityActionAllowed(
      "quiz-result",
      "update",
      {
        userPermissionLevel: actor.permissionLevel,
      },
    );
    try {
      const { entity, frontmatter } = parse(await this.read(itemId, actor));
      if (frontmatter.status === "handled") return;
      const result = await this.context.entityService.updateEntity({
        entity: {
          ...entity,
          content: quizResultAdapter.createContent({
            ...frontmatter,
            status: "handled",
          }),
          metadata: quizResultMetadataSchema.parse({
            ...entity.metadata,
            status: "handled",
          }),
        },
        options: { expectedContentHash: entity.contentHash },
      });
      if (result.skipped) throw new Error("Quiz result unavailable");
    } catch {
      throw new Error("Quiz result unavailable");
    }
  }

  private read(itemId: string, actor: InboxActor): Promise<BaseEntity | null> {
    return this.context.entityService.getEntity(
      {
        entityType: "quiz-result",
        id: itemId,
        visibilityScope: permissionToVisibilityScope(actor.permissionLevel),
      },
      quizResultSchema,
    );
  }
}
