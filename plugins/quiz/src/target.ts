import {
  answerText,
  formFields,
  type FormAnswers,
  type FormDefinition,
  type FormInboxItem,
  type FormInboxTarget,
  type FormNotificationState,
  type FormRecord,
  type FormSubmission,
} from "@brains/forms";
import { quizResultAdapter } from "./entity/adapter";
import {
  quizResultMetadataSchema,
  quizResultSchema,
  type QuizResult,
  type QuizResultFrontmatter,
} from "./entity/schema";

/** The fields a quiz asks for contact details, and the kind each must be. */
const CONTACT_FIELDS: ReadonlyMap<string, "text" | "email"> = new Map([
  ["name", "text"],
  ["email", "email"],
]);

/** Each answer, other than the contact details, as the taker saw it: the
 * question and what they gave, or the words of what they chose. Unanswered
 * questions are left out. */
function snapshot(
  form: FormDefinition,
  answers: FormAnswers,
): QuizResultFrontmatter["answers"] {
  return formFields(form).flatMap((field) => {
    if (CONTACT_FIELDS.has(field.id)) return [];
    const answer = answers[field.id];
    if (!("options" in field)) {
      const value = typeof answer === "string" ? answer : "";
      return value ? [{ field: field.id, label: field.label, value }] : [];
    }
    const chosen =
      answer === undefined ? [] : Array.isArray(answer) ? answer : [answer];
    const words = chosen.flatMap((value) => {
      const option = field.options.find(
        (candidate) => candidate.value === value,
      );
      return option ? [option.label] : [];
    });
    if (words.length === 0) return [];
    return [
      {
        field: field.id,
        label: field.label,
        value: field.kind === "choice" ? (words[0] ?? "") : words,
      },
    ];
  });
}

function frontmatterFor(submission: FormSubmission): QuizResultFrontmatter {
  const { form, answers, receivedAt, notify, results, language } = submission;
  const name = answerText(answers, "name");
  const email = answerText(answers, "email");
  return {
    quiz: form.id,
    quizTitle: form.title,
    ...(language ? { language } : {}),
    receivedAt: new Date(receivedAt).toISOString(),
    status: "new",
    notification: notify ? "pending" : "none",
    ...(name ? { name } : {}),
    ...(email ? { email } : {}),
    results: results.flatMap((result) => {
      const dimension = form.scoring?.dimensions.find(
        (candidate) => candidate.id === result.dimension,
      );
      const outcome = dimension?.outcomes.find(
        (candidate) => candidate.id === result.outcome,
      );
      return dimension && outcome
        ? [
            {
              dimension: dimension.id,
              title: dimension.title,
              outcome: outcome.id,
              outcomeTitle: outcome.title,
            },
          ]
        : [];
    }),
    answers: snapshot(form, answers),
  };
}

function record(frontmatter: QuizResultFrontmatter): FormRecord {
  return {
    content: quizResultAdapter.createContent(frontmatter),
    metadata: quizResultMetadataSchema.parse(
      quizResultAdapter.metadataFor(frontmatter),
    ),
  };
}

function read(entity: QuizResult): QuizResultFrontmatter {
  return quizResultAdapter.parseContent(entity.content).frontmatter;
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

/** Quiz results as quizzes produce them: one record per quiz taken. */
export const quizResultTarget: FormInboxTarget<QuizResult> = {
  entityType: "quiz-result",
  // One folder per quiz, as Studio lists them.
  idSeparator: ":",
  schema: quizResultSchema,

  refuse(form: FormDefinition): string | undefined {
    const misnamed = formFields(form).find((field) => {
      const kind = CONTACT_FIELDS.get(field.id);
      return kind !== undefined && kind !== field.kind;
    });
    return misnamed
      ? `Form "${form.id}": a quiz result takes "${misnamed.id}" as an ${CONTACT_FIELDS.get(misnamed.id)} field`
      : undefined;
  },

  record(submission: FormSubmission): FormRecord {
    return record(frontmatterFor(submission));
  },

  matches(entity: QuizResult, submission: FormSubmission): boolean {
    const stored = read(entity);
    const expected = frontmatterFor(submission);
    return (
      stored.quiz === expected.quiz &&
      stored.receivedAt === expected.receivedAt &&
      stored.name === expected.name &&
      stored.email === expected.email &&
      JSON.stringify(stored.answers) === JSON.stringify(expected.answers)
    );
  },

  notification(entity: QuizResult): FormNotificationState {
    return read(entity).notification;
  },

  withNotification(
    entity: QuizResult,
    notification: "sent" | "failed",
  ): FormRecord {
    const frontmatter = read(entity);
    return {
      content: quizResultAdapter.createContent({
        ...frontmatter,
        notification,
      }),
      metadata: quizResultMetadataSchema.parse({
        ...entity.metadata,
        notification,
      }),
    };
  },

  handled(entity: QuizResult): boolean {
    return read(entity).status === "handled";
  },

  /** The result as it was taken, whatever the quiz says now. */
  alert(entity: QuizResult) {
    const frontmatter = read(entity);
    return {
      answers: frontmatter.answers.map((answer) => ({
        label: answer.label,
        value: Array.isArray(answer.value)
          ? answer.value.join(", ")
          : answer.value,
      })),
      outcomes: frontmatter.results.map((result) => ({
        label: result.title,
        value: result.outcomeTitle,
      })),
      ...(frontmatter.email ? { replyTo: frontmatter.email } : {}),
    };
  },

  /** A result is a to-do only when its taker left a way to answer them;
   * every result is in Studio. */
  inbox: {
    sourceId: "quiz-results",
    displayName: "Quiz results",
    label: "Quiz",
    recordLabel: "Quiz result",
    listFilter: { contact: true },
    item(entity: QuizResult): FormInboxItem | undefined {
      const frontmatter = read(entity);
      if (!frontmatter.email) return undefined;
      return {
        title: `${entity.metadata.title} result`,
        summary: frontmatter.results
          .map((result) => `${result.title}: ${result.outcomeTitle}`)
          .join(" · "),
        receivedAt: frontmatter.receivedAt,
      };
    },
    detail(entity: QuizResult): string {
      return detail(read(entity));
    },
    withHandled(entity: QuizResult): FormRecord {
      return {
        content: quizResultAdapter.createContent({
          ...read(entity),
          status: "handled",
        }),
        metadata: quizResultMetadataSchema.parse({
          ...entity.metadata,
          status: "handled",
        }),
      };
    },
  },
};
