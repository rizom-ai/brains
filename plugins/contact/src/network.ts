import { z } from "@brains/utils/zod";

const ipv4 = z.ipv4();
const ipv6 = z.ipv6();

/** Caller supplies host-owned socket metadata, never a forwarding header or cookie.
 * /24 and /64 buckets intentionally limit address rotation within one network.
 */
export function contactNetwork(peer: string | undefined): string | undefined {
  if (!peer) return undefined;
  if (ipv4.safeParse(peer).success)
    return `v4:${peer.split(".").slice(0, 3).join(".")}`;
  if (!ipv6.safeParse(peer).success || peer.includes("%")) return undefined;
  const normalized = new URL(`http://[${peer}]`).hostname.slice(1, -1);
  const halves = normalized.split("::");
  const left = halves[0]?.split(":").filter(Boolean) ?? [];
  const right = halves[1]?.split(":").filter(Boolean) ?? [];
  const groups =
    halves.length === 1
      ? left
      : [
          ...left,
          ...Array<string>(8 - left.length - right.length).fill("0"),
          ...right,
        ];
  const numbers = groups.map((part) => Number.parseInt(part, 16));
  // IPv4-mapped IPv6 sockets must share the IPv4 quota bucket.
  if (numbers.slice(0, 5).every((part) => part === 0) && numbers[5] === 65535) {
    const high = numbers[6];
    const low = numbers[7];
    if (high === undefined || low === undefined) return undefined;
    return `v4:${high >>> 8}.${high & 255}.${low >>> 8}`;
  }
  return `v6:${numbers
    .slice(0, 4)
    .map((part) => part.toString(16))
    .join(":")}`;
}
