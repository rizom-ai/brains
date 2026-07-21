import { sha256Hex } from "@brains/utils/hash";

export interface InterfacePrincipalRef {
  interfaceType: string;
  subject: string;
}

export interface InterfacePrincipalGrantState {
  interfaceType: string;
  principalKeyHash: string;
  permissionLevel: "admin" | "trusted";
}

export interface InterfaceAnchorBindingState {
  interfaceType: string;
  principalKeyHash: string;
}

export interface RuntimeInterfacePrincipalState {
  grants: InterfacePrincipalGrantState[];
  anchors: InterfaceAnchorBindingState[];
}

export function normalizeInterfacePrincipal(
  interfaceType: string,
  subject: string,
): string {
  const normalizedInterface = interfaceType.trim().toLowerCase();
  const normalizedSubject = subject.trim();
  if (!normalizedInterface || !normalizedSubject) {
    throw new Error("Interface principal requires an interface and subject");
  }
  return `${normalizedInterface}:${normalizedSubject}`;
}

export function parseConfiguredInterfacePrincipal(
  value: string,
): InterfacePrincipalRef {
  const separator = value.indexOf(":");
  if (separator <= 0 || separator === value.length - 1) {
    throw new Error(`Invalid interface principal: ${value}`);
  }
  const interfaceType = value.slice(0, separator).trim().toLowerCase();
  const subject = value.slice(separator + 1).trim();
  normalizeInterfacePrincipal(interfaceType, subject);
  return { interfaceType, subject };
}

export function hashInterfacePrincipal(
  interfaceType: string,
  subject: string,
): string {
  return sha256Hex(normalizeInterfacePrincipal(interfaceType, subject));
}
