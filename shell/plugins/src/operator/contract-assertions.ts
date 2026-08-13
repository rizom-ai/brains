import { PermissionService, type UserPermissionLevel } from "@brains/templates";

const permissionLevels: readonly UserPermissionLevel[] = [
  "public",
  "trusted",
  "admin",
];

export function assertText(value: string, label: string): void {
  if (!value.trim()) throw new Error(`${label} must not be empty`);
}

export function assertOptionalText(
  value: string | undefined,
  label: string,
): void {
  if (value !== undefined) assertText(value, label);
}

export function assertPriority(
  priority: number | undefined,
  label: string,
): void {
  if (priority !== undefined && !Number.isFinite(priority)) {
    throw new Error(`${label} priority must be finite`);
  }
}

export function assertPermission(
  permission: UserPermissionLevel,
  label: string,
): void {
  if (!permissionLevels.includes(permission)) {
    throw new Error(
      `${label} permission "${String(permission)}" is unsupported`,
    );
  }
}

/**
 * True when `granted` satisfies `required`, using the shell's single permission
 * ordering rather than a local rank table.
 */
export function meetsPermission(
  granted: UserPermissionLevel,
  required: UserPermissionLevel,
): boolean {
  return PermissionService.hasPermission(granted, required);
}
