---
"@rizom/brain": patch
"@rizom/ops": patch
---

Bound projection coordination during durable import roots by using a read-only active-barrier check for ordinary mutation wakeups, reserving full batch recovery for startup and periodic recovery sweeps, and scheduling one projection wave after the final child closes the root.

Prevent recovery-triggered wakeups from recursively entering their own coordination sweep. Add explicit skill and SWOT derivation controls so directory-sync acceptance runs can enforce a genuinely external-AI-free posture.
