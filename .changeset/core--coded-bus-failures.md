---
"@brains/plugins": minor
"@brains/sdk": minor
"@brains/messaging-service": minor
"@brains/studio": patch
---

A failed request says why in a word, not a sentence

Studio decided whether asking an agent was available by matching the opening
words of an error the messaging service composes. Reword that sentence and
Studio answers 400 where it should answer 503, and nothing says so.

A failed bus answer now carries a `code` beside its message. `no_handler` means
nothing is listening, so the capability is absent from this brain rather than
broken; `handler_failed` means something answered and threw. The set is
deliberately small: a code earns its place when a caller has to do something
different, not to name every way things go wrong.

`messageErrorCodeSchema` and `MessageErrorCode` are on the services entry, with
Studio as the named consumer. The message stays human-readable and outside any
matching guarantee, and a test proves rewording it does not change what Studio
answers.
