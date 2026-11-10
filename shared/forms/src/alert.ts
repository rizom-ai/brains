/** One answer as the owner reads it: the field's label and what was given. */
export interface FormAlertAnswer {
  label: string;
  value: string;
}

export interface FormAlertContent {
  answers: FormAlertAnswer[];
  /** A scored submission's results: each dimension and its outcome. */
  outcomes?: FormAlertAnswer[] | undefined;
  /** Where the owner marks the submission done. */
  inboxUrl: string;
  /** The alert's Reply-To is the person who submitted it. */
  replyable: boolean;
}

/** The alert's text: each answer under its label, then where to deal with it.
 * A multi-line answer starts on its own line. */
export function formAlertText(content: FormAlertContent): string {
  const answers = content.answers
    .filter((answer) => answer.value !== "")
    .map((answer) =>
      answer.value.includes("\n")
        ? `${answer.label}:\n${answer.value}`
        : `${answer.label}: ${answer.value}`,
    );
  const outcomes = (content.outcomes ?? []).map(
    (outcome) => `${outcome.label}: ${outcome.value}`,
  );
  return [
    ...answers,
    "",
    ...(outcomes.length > 0 ? ["Results:", ...outcomes, ""] : []),
    ...(content.replyable ? ["Reply to this email to answer."] : []),
    `Mark it done in your Inbox: ${content.inboxUrl}`,
  ].join("\n");
}
