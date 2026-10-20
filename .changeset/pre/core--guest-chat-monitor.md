---
"@rizom/brain": patch
---

Studio now has an admin-only **Guest chat** workspace wherever guest chat keeps a usage record. It shows what the public endpoint did — questions, measured cost, unknown-cost and unresolved counts for today and this month, a meter of questions and reserved cost against the allowance (measured cost never returns allowance), recording health and retention, recent questions, refusals by reason with their detailed and counted coverage, and the most active visitors within the retained window — with the switch beside the numbers. Opening guest chat asks for a prepared confirmation that states what the allowance still permits; closing it is one step and stops admissions at once. A recorded question can be saved as a note through its own confirmed action: web-chat sends it to the note plugin over the new `note:capture` message (`@brains/contracts`), and the note plugin keeps such notes restricted to the owner.
