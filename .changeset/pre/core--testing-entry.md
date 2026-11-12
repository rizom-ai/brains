---
"@brains/app": patch
"@brains/core": patch
"@brains/plugins": patch
"@brains/http-host": patch
"@rizom/brain": patch
---

`@rizom/brain/testing` runs a package's own tests on the runtime itself. `startTestBrain({ plugins: [use(definition)] })` starts a brain in the test's process, on the runtime's own services and a temporary storage of its own, running the packages under the name the working directory's `package.json` gives them and holding that package to its `@rizom/brain` peer range. The brain calls a tool as `brain tool` does, as its operator, and answers in the tool's public form; it asks a contract as the brain asks, serves a `Request` through the routes its packages declare, reads every stored record through an `EntityReader`, and waits for a queued job's status by the job's definition. It reaches no AI provider and computes no embeddings, and `stop()` deletes what it stored.
