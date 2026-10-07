---
"@brains/plugins": minor
---

Offer `entityShapes` to a service's `setup`, not only to `ready`, and give it two more reads.

An editor reads entity shapes inside route handlers, which are built from what setup held, so a read offered only at ready is offered too late. It also asks two questions `ServiceEntityShapes` did not answer: `hasBody(entityType)`, because a body sent for a type that has none is refused rather than stored; and `parse(entityType, markdown)`, because a type's own adapter is what says what its markdown means, and a console that assembled an entity from a form has markdown to be told the meaning of. Both read the registry and neither writes it.

Named consumer: @brains/studio.
