---
"@rizom/brain": patch
---

The LinkedIn import fills the anchor profile by asking profile, its steward, instead of writing it itself. Studio shows and imports the same fields with the same outcomes, keeps what the owner wrote, and refuses a confirmation once the profile has changed; when the brain does not let LinkedIn import, the workspace says so. The import now reads LinkedIn before the profile, so a brain with no anchor profile and a refused LinkedIn token reports the token rather than the missing profile.
