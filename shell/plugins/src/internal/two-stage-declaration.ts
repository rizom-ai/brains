/**
 * Where a two-stage declaration puts each slot. The header says what a
 * package is, the behavior what it does with what the header set up; the
 * types refuse a slot in the wrong half, and this tells an untyped author too,
 * rather than having a misplaced slot work by accident.
 */
export interface TwoStageSlots {
  /** How errors name the declaration, e.g. `Service`. */
  readonly label: string;
  /** The helper that declares it, e.g. `defineServicePlugin`. */
  readonly helper: string;
  readonly header: ReadonlySet<string>;
  readonly behavior: ReadonlySet<string>;
}

export function assertTwoStageSlots(
  slots: TwoStageSlots,
  header: { readonly id: string },
  behavior: object | undefined,
): void {
  const misplaced = Object.keys(header).find((key) => !slots.header.has(key));
  if (misplaced !== undefined) {
    throw new Error(
      `${slots.label} "${header.id}" declares "${misplaced}" in its header; behavior is ${slots.helper}'s second argument`,
    );
  }
  const unknown = Object.keys(behavior ?? {}).find(
    (key) => !slots.behavior.has(key),
  );
  if (unknown !== undefined) {
    throw new Error(
      `${slots.label} "${header.id}" declares "${unknown}", which is not a behavior slot`,
    );
  }
}
