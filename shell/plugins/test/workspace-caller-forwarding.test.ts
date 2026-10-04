import { expect, test } from "bun:test";
import { AuthRegistry } from "../src/contracts/auth-registry";
import {
  createStudioWorkspaceActor,
  workspaceCaller,
} from "../src/operator/workspace-actor";
import {
  issueRouteCaller,
  revokeRouteCaller,
} from "../src/internal/route-caller-authority";
import type { InterfaceCaller } from "../src/interface/route-contract";

const claims: InterfaceCaller = {
  actor: { id: "session", canonicalId: "person" },
  permission: "admin",
  isAnchor: true,
};

test("Studio forwarding requires issued identity, preserves attribution and refuses copies and other runtimes", () => {
  const authority = AuthRegistry.createFresh();
  expect(() =>
    workspaceCaller(createStudioWorkspaceActor(claims), authority),
  ).toThrow();
  const caller = issueRouteCaller(claims, authority);
  const actor = createStudioWorkspaceActor(caller);
  expect(Object.isFrozen(actor)).toBe(true);
  expect(actor.actor).toEqual({
    kind: "user",
    userId: "session",
    canonicalId: "person",
  });
  expect(workspaceCaller(actor, authority)).toBe(caller);
  expect(() => workspaceCaller({ ...actor }, authority)).toThrow();
  expect(() => workspaceCaller(actor, AuthRegistry.createFresh())).toThrow();
  expect(() =>
    workspaceCaller(createStudioWorkspaceActor({ ...caller }), authority),
  ).toThrow();
  expect(JSON.stringify(actor)).toBe(JSON.stringify({ ...actor }));
  const forwarded = Object.defineProperty(
    { ...actor },
    Symbol.for("@rizom/brain/studio-workspace-caller"),
    { value: caller },
  );
  expect(workspaceCaller(forwarded, authority)).toBe(caller);
  forwarded.userPermissionLevel = "public";
  expect(() => workspaceCaller(forwarded, authority)).toThrow();
  revokeRouteCaller(caller);
  expect(() => workspaceCaller(actor, authority)).toThrow();
  expect(() =>
    workspaceCaller(createStudioWorkspaceActor(caller), authority),
  ).toThrow();
});

test("Studio forwarding cannot extend a cancelled request", () => {
  const authority = AuthRegistry.createFresh();
  const controller = new AbortController();
  const caller = issueRouteCaller(claims, authority, controller.signal);
  const actor = createStudioWorkspaceActor(caller);
  controller.abort();
  expect(() => workspaceCaller(actor, authority)).toThrow();
  expect(() =>
    workspaceCaller(createStudioWorkspaceActor(caller), authority),
  ).toThrow();
});
