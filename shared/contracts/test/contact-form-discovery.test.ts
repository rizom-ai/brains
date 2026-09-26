import { describe, expect, it } from "bun:test";
import {
  contactFormDiscoveryRequest,
  type ContactFormDiscovery,
} from "../src/contact-form-discovery";

const route: ContactFormDiscovery["routes"][number] = {
  path: "/contact",
  method: "GET",
  public: true,
  preview: false,
};
describe("Contact form discovery boundary", () => {
  it("accepts presentation metadata only", () => {
    const input = { origin: "https://brain.test", routes: [route] };
    const result = contactFormDiscoveryRequest.response.parse(input);
    expect(result).toEqual(input);
    expect(result).not.toBe(input);
    expect(result.routes[0]).not.toBe(route);
  });
  it.each([
    { ...route, handler: (): Response => new Response() },
    { ...route, token: "secret" },
    { ...route, path: "/admin" },
    { ...route, method: "DELETE" },
  ])("rejects handlers, secrets and unrelated routes: %j", (invalid) => {
    expect(
      contactFormDiscoveryRequest.response.safeParse({
        origin: "https://brain.test",
        routes: [invalid],
      }).success,
    ).toBe(false);
  });
  it("bounds responses and refuses request authority fields", () => {
    expect(
      contactFormDiscoveryRequest.response.safeParse({
        origin: "https://brain.test",
        routes: Array.from({ length: 4 }, () => route),
      }).success,
    ).toBe(false);
    expect(
      contactFormDiscoveryRequest.payload.safeParse({ role: "admin" }).success,
    ).toBe(false);
  });
});
