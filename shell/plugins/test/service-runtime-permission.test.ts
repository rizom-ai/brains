import { describe, expect, it } from "bun:test";
import { PermissionService } from "@brains/templates";
import { hasPermission } from "../src";

const levels = ["public", "trusted", "admin"] as const;

/**
 * Whether a caller's level reaches the level a surface needs, as a
 * converted service's class read PermissionService.hasPermission: the one
 * rule, as a function, without the class.
 */
describe("hasPermission for a first-party service", () => {
  it("answers as the permission service does for every pair of levels", () => {
    for (const granted of levels)
      for (const required of levels)
        expect({
          granted,
          required,
          allowed: hasPermission(granted, required),
        }).toEqual({
          granted,
          required,
          allowed: PermissionService.hasPermission(granted, required),
        });
    expect(hasPermission("trusted", "admin")).toBe(false);
    expect(hasPermission("admin", "trusted")).toBe(true);
  });
});
