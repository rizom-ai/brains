/**
 * Re-apply a generic signature that `mock()` erased.
 *
 * `mock(fn)` returns `Mock<typeof fn>`, which captures one concrete
 * instantiation and drops the type parameters. A `Mock` can therefore never be
 * assigned to a generic member such as
 * `getEntity<T extends BaseEntity>(request): Promise<T | null>`, even when the
 * underlying function is perfectly correct — assigning the unwrapped function
 * to the same member compiles, and only wrapping it in `mock()` fails.
 *
 * Every use of this is that one limitation and nothing else. It is deliberately
 * a named function rather than an inline `as`, so the reason is greppable and
 * a reader can tell it apart from a cast that papers over a real mismatch. It
 * must not be used to make a mock of the wrong shape fit: pass the member type
 * as `TMember` and let the surrounding `satisfies` check everything else.
 */
export function genericSpy<TMember>(spy: unknown): TMember {
  return spy as TMember;
}
