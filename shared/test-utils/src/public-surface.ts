/**
 * The public surface of a type: the members a mock object literal can
 * actually implement.
 *
 * Several things mocked here are classes rather than interfaces
 * (`Logger`, `ProgressReporter`). A literal can never be structurally
 * assignable to a class type that has private fields, which is why those
 * factories historically reached for `as unknown as` — a cast that also
 * erased every check on the members the mock *does* define.
 *
 * `keyof` omits private and protected members, so `PublicSurface<T>` keeps
 * exactly the members a test can stand in for. Declaring the literal against
 * it means adding a public method to the class, or changing one's signature,
 * fails to compile here. The remaining single `as T` at the return covers only
 * the nominal private-field gap, not the shape.
 */
export type PublicSurface<T> = Pick<T, keyof T>;
