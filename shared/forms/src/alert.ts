/** One answer as the owner reads it: the field's label and what was given. */
export interface FormAlertAnswer {
  label: string;
  value: string;
}

export interface FormAlertContent {
  answers: FormAlertAnswer[];
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
  return [
    ...answers,
    "",
    ...(content.replyable ? ["Reply to this email to answer."] : []),
    `Mark it done in your Inbox: ${content.inboxUrl}`,
  ].join("\n");
}
