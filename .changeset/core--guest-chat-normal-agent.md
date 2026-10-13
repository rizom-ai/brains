---
"@rizom/brain": patch
---

Guest chat now runs on the brain's own agent as a public user.

- **Same agent as owner chat:** the brain's model, identity, public profile (without the owner's email) and instructions, the reviewed public read tools, and normal search. A short visitor instruction tells it to answer from the brain's public content.
- **Guest-only limits removed.** They ended answers early or emptied them: a three-step cap, output, context and lookup caps, a 32 KB request guard, a separate guest search and a 30-second stream idle timer.
- **Deadline:** an answer is bounded by a three-minute deadline.
- **Cost:** measured from each step's reported usage, and charged the answer cap when it cannot be measured.
- **Diagnosable failures:** a failed or empty guest turn is logged with its reason; visitors still see only that the answer failed.
