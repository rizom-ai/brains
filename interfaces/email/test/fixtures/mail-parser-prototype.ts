import { parseInboundEmail } from "../../src/inbound-email";

// The old parser mutates Object.prototype before failing. Keep that regression
// isolated so it cannot contaminate the parent test runner or later fixtures.
const before = Object.getOwnPropertyDescriptors(Object.prototype);
const email = await parseInboundEmail(
  {
    uid: 7,
    source: Buffer.from(
      "From: sender@example.com\r\nContent-Type: text/plain; __proto__*0*=utf-8''ignored; charset=utf-8\r\n\r\nbody",
    ),
    receivedAt: new Date("2026-04-15T09:00:00Z"),
  },
  "imap:parser-fixture",
);
if (email.text !== "body") throw new Error("Mail body changed");
const after = Object.getOwnPropertyDescriptors(Object.prototype);
if (Reflect.ownKeys(before).length !== Reflect.ownKeys(after).length) {
  throw new Error("Object.prototype properties changed");
}
for (const key of Object.keys(before)) {
  const previous = before[key];
  const current = after[key];
  if (
    !previous ||
    !current ||
    previous.value !== current.value ||
    previous.get !== current.get ||
    previous.set !== current.set ||
    previous.writable !== current.writable ||
    previous.enumerable !== current.enumerable ||
    previous.configurable !== current.configurable
  ) {
    throw new Error(`Object.prototype descriptor changed: ${key}`);
  }
}
console.log("prototype-safe-mail-ok");
