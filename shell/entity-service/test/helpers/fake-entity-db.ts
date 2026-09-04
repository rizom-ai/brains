import type { EntityDB } from "../../src/db";

/**
 * Build a stand-in EntityDB from a chainable query stub.
 *
 * EntityDB is drizzle's SqliteDatabase: `select()` returns a builder whose
 * every method is generic over the columns selected and the joins applied, and
 * whose overloads number in the dozens. A stub cannot satisfy that shape
 * structurally — there is nothing honest to write a `satisfies` against — so
 * the widening is unavoidable for any test that drives a query without a real
 * database.
 *
 * It lives here, named once, rather than at each call site: three tests were
 * repeating it inline, where it read like an ordinary cast rather than a
 * deliberate accommodation of an external library's type.
 *
 * The stub must still behave: whatever `select()` returns has to answer the
 * chain the code under test actually calls, or the test fails at runtime
 * rather than compile time. That trade is the reason to keep these tests
 * narrow and prefer a real database where one is affordable.
 */
export function fakeEntityDb(select: () => unknown): EntityDB {
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- drizzle SqliteDatabase has no structural shape a stub can satisfy; see the comment above
  return { select } as unknown as EntityDB;
}
