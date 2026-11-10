# @brains/quiz

Quizzes on a brain's site, on the forms engine (`@brains/forms`). A quiz is a
form defined in the brain's content that targets `quiz-result`; each one taken
is a `quiz-result` record. The package is in the canonical catalog for explicit
addition (`add: [quiz]`) and belongs to no bundle. `quizPlugin()` composes the
entity and the service. There are no built-in quizzes and no public tools.

## Quiz results

A `quiz-result` is restricted and never embedded, indexed or used as a
projection source. It says itself what was asked and answered, so a later edit
to its quiz never changes it:

- `quiz` (the form's id), `language` when it was taken in a translation, and
  `receivedAt`;
- `results`: each scored dimension's result as it was shown (`dimension`,
  `title`, `outcome`, `outcomeTitle`);
- `answers`: each answered question as the taker saw it (`field`, `label`, and
  the text given or the words of the options chosen);
- `name` and `email` when the quiz asks for them and the taker gave them;
- `status` (`new` or `handled`) and `notification` (`pending`, `sent`,
  `failed`, or `none` for a quiz that sends no alert).

Results are filed under their quiz (`<quiz>:<key>`), so Studio lists them by
quiz. A result is a to-do in the "Quiz results" Inbox source only when its taker
left an email; every result is in Studio. The owner's alert carries the answers
and results, with Reply-To the taker's email when there is one.

A quiz may ask `name` (text) and `email` (email) for contact details; a quiz
asking either as another kind is refused.

## Validation

From this package: `bun test` and `bun run typecheck`.
