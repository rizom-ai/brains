import { afterAll, test } from "bun:test";
import assert from "node:assert/strict";
import { CanonicalTestLifetime } from "./turso-canonical-lifetime";

// Expected-failing runner probe. Its short injected deadline is not the
// canonical fixture's unchanged five-second acceptance deadline.
const lifetime = new CanonicalTestLifetime();
let databaseClosed = false;
let appStopped = false;
afterAll(async () => {
  const joining = lifetime.join();
  assert.throws(() => lifetime.assertOpen(), /retiring/);
  console.error("new database admission fenced");
  try {
    await joining;
  } finally {
    assert.equal(appStopped, true);
    databaseClosed = true;
    console.error("database joined after App cleanup");
  }
});
test(
  "injected runner timeout remains a failure",
  () =>
    lifetime.run(async () => {
      try {
        await Bun.sleep(100);
        throw new Error("late source failure retained");
      } finally {
        assert.equal(databaseClosed, false);
        appStopped = true;
        console.error("App cleanup observed open database");
      }
    }),
  20,
);
