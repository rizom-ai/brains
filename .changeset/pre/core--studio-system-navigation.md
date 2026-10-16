---
"@brains/studio": patch
"@brains/build-tools": patch
"@rizom/brain": patch
---

Replace Studio's long flat rail with stable Overview, Library, Work, and System areas plus a contextual destination leaf. Browse areas without changing the working document, keep the same navigation through editors and Chat, and use one explicit Browse sheet on tablet and phone. Desktop collapse is deliberate and remembered across destinations and reloads; selecting an area restores its leaf. Mobile groups fold independently, and the dock opens the requested group without navigating. Compile navigation styling to static CSS with StyleX, extending the shared test preload to cover Studio style modules.
