import { z } from "@brains/utils/zod";

/*
 * The peers of a brain that holds seminars, read from its directory: each
 * under the name the owner shows him by there, in the order the brain's
 * pages give them.
 */

const directoryPeerSchema = z.object({
  id: z.string().min(1),
  metadata: z.object({
    name: z.string().min(1),
    shownAs: z.string().min(1).optional(),
  }),
});

/** A peer of the directory as a seminar names him. */
export function peerOf(agent: unknown): { id: string; name: string } {
  const { id, metadata } = directoryPeerSchema.parse(agent);
  // The chair then writes of Marx, not of the brain named Karl.
  return { id, name: metadata.shownAs ?? metadata.name };
}

/** The peers the brain orders first, as it orders them, then the others by id. */
export function inOrder<T extends { id: string }>(
  peers: readonly T[],
  order: readonly string[],
): T[] {
  const place = (id: string): number => {
    const index = order.indexOf(id);
    return index === -1 ? order.length : index;
  };
  return [...peers].sort(
    (left, right) =>
      place(left.id) - place(right.id) || left.id.localeCompare(right.id),
  );
}
