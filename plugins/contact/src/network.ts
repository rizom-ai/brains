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

/** Loopback or private-network socket peers: where a TLS-terminating proxy the
 * deployment runs (Kamal's, on the container network) connects from. A public
 * peer is never a trusted proxy, whatever it claims in headers.
 */
export function isPrivatePeer(peer: string | undefined): boolean {
  if (!peer) return false;
  if (ipv6.safeParse(peer).success && !peer.includes("%"))
    if (new URL(`http://[${peer}]`).hostname === "[::1]") return true;
  const network = contactNetwork(peer);
  if (!network) return false;
  if (network.startsWith("v4:")) {
    const [a, b] = network.slice(3).split(".").map(Number);
    return (
      a === 10 ||
      a === 127 ||
      (a === 172 && b !== undefined && b >= 16 && b <= 31) ||
      (a === 192 && b === 168)
    );
  }
  // Unique local IPv6 addresses (fc00::/7).
  const first = Number.parseInt(network.slice(3).split(":")[0] ?? "", 16);
  return (first & 0xfe00) === 0xfc00;
}
