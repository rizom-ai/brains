import type { AuthAdministration } from "@brains/auth-service";
import {
  createBuiltInStudioWorkspaceRegistration,
  defineStudioWorkspace,
  defineWorkspaceAction,
  type OperatorCaller,
  type OperatorRegionBlock,
  type OperatorViewBlock,
  type RuntimeStudioOperatorBlock,
  type RuntimeStudioOperatorColumnsBlock,
  type RuntimeStudioOperatorPanelBlock,
  type RuntimeStudioOperatorRegionBlock,
  type ServicePluginContext,
} from "@brains/plugins";
import { z } from "@brains/utils/zod";
import {
  adminWorkspaceSource,
  formatWorkspaceDate,
  peerOriginLabel,
  requireAuthService,
  type AdminWorkspaceSource,
} from "./workspace-format";

type PeopleTotalsBlock = Extract<
  RuntimeStudioOperatorPanelBlock,
  { type: "stats" }
>;

function requiredPeopleBlock(
  blocks: readonly RuntimeStudioOperatorBlock[],
  id: string,
): RuntimeStudioOperatorBlock {
  const matches = blocks.filter((block) => block.id === id);
  if (matches.length !== 1 || !matches[0]) {
    throw new Error(
      `People tab composition requires block "${id}" exactly once`,
    );
  }
  return matches[0];
}

function requiredPeopleRegion(
  blocks: readonly RuntimeStudioOperatorBlock[],
  id: string,
): RuntimeStudioOperatorRegionBlock {
  const block = requiredPeopleBlock(blocks, id);
  switch (block.type) {
    case "tabs":
    case "detail":
    case "columns":
      throw new Error(`People tab composition block "${id}" must be a region`);
    default:
      return block;
  }
}

/**
 * People leads with the roster and follows with its standing material in the
 * console's main-plus-aside grammar, the same rhythm the Invitations tab
 * uses. The roster stays a top-level block because master/detail already owns
 * two columns and the region contract admits no nested detail; totals are
 * hoisted so the workspace head carries them instead of a full-width band
 * above the table.
 */
export function composePeopleTabSections(
  blocks: readonly RuntimeStudioOperatorBlock[],
  peerNote: RuntimeStudioOperatorRegionBlock,
  peerSections: readonly RuntimeStudioOperatorRegionBlock[],
): {
  readonly totals: PeopleTotalsBlock;
  readonly blocks: readonly Exclude<
    RuntimeStudioOperatorBlock,
    { type: "tabs" }
  >[];
} {
  const totals = requiredPeopleBlock(blocks, "people-summary");
  if (totals.type !== "stats") {
    throw new Error(
      'People tab composition block "people-summary" must be stats',
    );
  }
  const roster = requiredPeopleBlock(blocks, "people");
  if (roster.type !== "detail") {
    throw new Error('People tab composition block "people" must be a detail');
  }
  // The peer roster follows the member roster in the same column, so it needs
  // its own caption: a bare table would read as more rows of the table above.
  const peerRoster = peerSections
    .filter(
      (block): block is RuntimeStudioOperatorPanelBlock =>
        block.id === "peers" && block.type !== "card",
    )
    .map((block) => ({
      type: "card" as const,
      id: "people-peers",
      label: "External brains",
      blocks: [block],
    }));
  const peerActions = peerSections.filter((block) => block.id !== "peers");
  const layout: RuntimeStudioOperatorColumnsBlock = {
    type: "columns",
    id: "people-standing",
    primary: peerRoster,
    aside: [
      requiredPeopleRegion(blocks, "brain-anchor"),
      peerNote,
      ...peerActions,
    ],
  };
  return { totals, blocks: [roster, layout] };
}

const peopleQuerySchema = z.strictObject({
  selected: z.string().trim().min(1).max(200).optional(),
});
const statusResultSchema = z.strictObject({ status: z.string() });
const setupResultSchema = z.strictObject({
  status: z.string(),
  setupUrl: z.url(),
  expiresAt: z.string(),
});
const userInputSchema = z.strictObject({ userId: z.string().min(1) });
const roleInputSchema = z.strictObject({
  userId: z.string().min(1),
  role: z.enum(["admin", "trusted", "public"]),
});
const statusInputSchema = z.strictObject({
  userId: z.string().min(1),
  status: z.enum(["active", "suspended"]),
});
const passkeyInputSchema = z.strictObject({
  userId: z.string().min(1),
  credentialId: z.string().min(1),
});
const identityInputSchema = z.strictObject({
  userId: z.string().min(1),
  type: z.string().trim().min(1).max(64),
  subject: z.string().trim().min(1).max(2_000),
  issuer: z.string().trim().min(1).max(2_000).optional(),
  label: z.string().trim().min(1).max(200).optional(),
});
const identityIdInputSchema = z.strictObject({
  userId: z.string().min(1),
  identityId: z.string().min(1),
});
const unlinkPeerInputSchema = z.strictObject({
  userId: z.string().min(1),
  peerId: z.string().trim().min(1).max(2_000),
});

const updateRole = defineWorkspaceAction({
  name: "update-person-role",
  label: "Change role",
  permission: "admin",
  confirmation: { kind: "prepared" },
  input: roleInputSchema,
  output: statusResultSchema,
});
const updateStatus = defineWorkspaceAction({
  name: "update-person-status",
  label: "Suspend person",
  permission: "admin",
  catalog: true,
  confirmation: { kind: "prepared" },
  input: statusInputSchema,
  output: statusResultSchema,
});
const deletePerson = defineWorkspaceAction({
  name: "delete-person",
  label: "Delete person",
  permission: "admin",
  confirmation: { kind: "prepared" },
  input: userInputSchema,
  output: statusResultSchema,
});
const revokePasskey = defineWorkspaceAction({
  name: "revoke-person-passkey",
  label: "Revoke passkey",
  permission: "admin",
  confirmation: { kind: "prepared" },
  input: passkeyInputSchema,
  output: statusResultSchema,
});
const startPasskeyRegistration = defineWorkspaceAction({
  name: "start-person-passkey-registration",
  label: "Create setup link",
  permission: "admin",
  confirmation: {
    kind: "static",
    message: "Create a single-use passkey setup link for this person?",
  },
  input: userInputSchema,
  output: setupResultSchema,
});
const revokeSessions = defineWorkspaceAction({
  name: "revoke-person-sessions",
  label: "Revoke all sessions",
  permission: "admin",
  confirmation: { kind: "prepared" },
  input: userInputSchema,
  output: statusResultSchema,
});
const attachIdentity = defineWorkspaceAction({
  name: "attach-person-identity",
  label: "Attach channel",
  permission: "admin",
  confirmation: {
    kind: "static",
    message: "Attach this verified channel identity to the selected person?",
  },
  input: identityInputSchema,
  output: statusResultSchema,
});
const detachIdentity = defineWorkspaceAction({
  name: "detach-person-identity",
  label: "Detach channel",
  permission: "admin",
  confirmation: { kind: "prepared" },
  input: identityIdInputSchema,
  output: statusResultSchema,
});
const unlinkExternalPeer = defineWorkspaceAction({
  name: "unlink-external-peer",
  label: "Unlink peer",
  permission: "admin",
  confirmation: { kind: "prepared" },
  input: unlinkPeerInputSchema,
  output: statusResultSchema,
});

const personSchema = z.strictObject({
  userId: z.string(),
  displayName: z.string(),
  role: z.enum(["admin", "trusted", "public"]),
  status: z.enum(["active", "suspended"]),
  isAnchor: z.boolean(),
  isSelf: z.boolean(),
  profileEntityId: z.string().optional(),
  passkeys: z.array(
    z.strictObject({
      id: z.string(),
      kind: z.string(),
      createdAt: z.number(),
    }),
  ),
  identities: z.array(
    z.strictObject({
      id: z.string(),
      type: z.string(),
      displayName: z.string(),
      label: z.string(),
      verified: z.boolean(),
    }),
  ),
  peers: z.array(
    z.strictObject({
      peerId: z.string(),
      verificationStatus: z.enum(["unverified", "verified"]),
    }),
  ),
});
const peopleDataSchema = z.strictObject({
  query: peopleQuerySchema,
  anchor: z.strictObject({
    kind: z.enum(["person", "collective"]),
    configuredKind: z.enum(["person", "team", "organization"]),
    displayName: z.string(),
    administeredBy: z.number().int().nonnegative(),
  }),
  people: z.array(personSchema),
  activeCount: z.number().int().nonnegative(),
  activeAdminCount: z.number().int().nonnegative(),
  suspendedCount: z.number().int().nonnegative(),
  channelTypes: z.array(
    z.strictObject({ type: z.string(), displayName: z.string() }),
  ),
});

type PeopleAction =
  | typeof updateRole
  | typeof updateStatus
  | typeof deletePerson
  | typeof revokePasskey
  | typeof startPasskeyRegistration
  | typeof revokeSessions
  | typeof attachIdentity
  | typeof detachIdentity
  | typeof unlinkExternalPeer;
type PeopleBlock = OperatorViewBlock<PeopleAction>;
type PeopleRegion = OperatorRegionBlock<PeopleAction>;
type PeoplePanel = Exclude<PeopleRegion, { type: "card" }>;

const setupResultPresentation = {
  title: "Passkey setup",
  fields: {
    status: { label: "Status" },
    setupUrl: {
      label: "Single-use setup URL",
      copyable: true,
      sensitive: true,
    },
    expiresAt: { label: "Expires" },
  },
};

function accountLinkBlock(): PeoplePanel {
  return {
    type: "links",
    items: [
      {
        label: "Manage your own credentials and sessions",
        target: { launch: { target: "account-settings" } },
      },
    ],
  };
}

function warningBlock(text: string): PeoplePanel {
  return { type: "notice", tone: "warn", text };
}

function setupActionBlock(userId: string): PeoplePanel {
  return {
    type: "action",
    action: startPasskeyRegistration,
    input: { userId },
    result: setupResultPresentation,
  };
}

function attachIdentityActionBlock(
  userId: string,
  channels: readonly { type: string; displayName: string }[],
): PeoplePanel {
  return {
    type: "action",
    action: attachIdentity,
    input: { userId },
    form: {
      submitLabel: "Attach channel",
      fields: {
        type: {
          label: "Channel type",
          control: "select",
          options: channels.map((channel) => ({
            value: channel.type,
            label: channel.displayName,
          })),
        },
        subject: { label: "Channel subject", control: "text" },
        issuer: { label: "Issuer (optional)", control: "url" },
        label: { label: "Display label (optional)", control: "text" },
      },
    },
  };
}

function titleCase(value: string): string {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}

function signInSummary(passkeys: number, channels: number): string {
  return `${passkeys} ${passkeys === 1 ? "passkey" : "passkeys"} · ${channels} ${channels === 1 ? "channel" : "channels"}`;
}

function defaultAnchor(
  displayName: string,
  administeredBy: number,
): {
  kind: "person";
  configuredKind: "person";
  displayName: string;
  administeredBy: number;
} {
  return {
    kind: "person",
    configuredKind: "person",
    displayName,
    administeredBy,
  };
}

const peopleWorkspace = defineStudioWorkspace({
  id: "people",
  label: "People",
  priority: 10,
  permission: "admin",
  query: peopleQuerySchema,
  data: peopleDataSchema,
  actions: [
    updateRole,
    updateStatus,
    deletePerson,
    revokePasskey,
    startPasskeyRegistration,
    revokeSessions,
    attachIdentity,
    detachIdentity,
    unlinkExternalPeer,
  ],
  badge: ({ data }) => data.suspendedCount,
  view: ({ data }) => {
    const selected = data.people.find(
      (person) => person.userId === data.query.selected,
    );
    const openBlocks: PeopleRegion[] = [];
    if (selected) {
      const protectsLastAdmin =
        selected.role === "admin" &&
        selected.status === "active" &&
        data.activeAdminCount <= 1;
      const roleProtection = selected.isAnchor
        ? "A professional Anchor must remain an active Admin."
        : selected.status === "suspended"
          ? "Reactivate this person before changing access."
          : protectsLastAdmin
            ? "Add another active Admin before changing this role."
            : undefined;
      const suspensionProtection = selected.isAnchor
        ? "The professional Anchor cannot be suspended."
        : protectsLastAdmin
          ? "Add another active Admin before suspending this person."
          : undefined;
      openBlocks.push({
        type: "key-values",
        id: "person-summary",
        items: [
          { label: "Role", value: titleCase(selected.role) },
          { label: "Status", value: titleCase(selected.status) },
          { label: "Anchor", value: selected.isAnchor },
          {
            label: "Brain relationship",
            value:
              selected.peers.length > 0
                ? "External peer + local member"
                : "Hosted member",
          },
        ],
      });
      if (roleProtection) {
        openBlocks.push({ type: "notice", tone: "warn", text: roleProtection });
      } else {
        openBlocks.push({
          type: "card",
          id: "person-role",
          label: "Permission role",
          blocks: [
            {
              type: "action",
              action: updateRole,
              input: { userId: selected.userId, role: selected.role },
              form: {
                submitLabel: "Change role",
                fields: {
                  role: {
                    label: "Role",
                    control: "select",
                    options: [
                      { value: "admin", label: "Admin" },
                      { value: "trusted", label: "Trusted" },
                      { value: "public", label: "Public" },
                    ],
                  },
                },
              },
            },
          ],
        });
      }
      openBlocks.push({
        type: "card",
        id: "person-access",
        label: "Access",
        blocks: [
          {
            type: "actions",
            items: [
              {
                action: updateStatus,
                input: {
                  userId: selected.userId,
                  status:
                    selected.status === "suspended" ? "active" : "suspended",
                },
                capability: {
                  id:
                    selected.status === "suspended"
                      ? "reactivate-person"
                      : "suspend-person",
                  label:
                    selected.status === "suspended"
                      ? "Reactivate person"
                      : "Suspend person",
                },
                disabled:
                  selected.status === "active" &&
                  suspensionProtection !== undefined,
              },
              ...(selected.status === "active" && !selected.isSelf
                ? [
                    {
                      action: revokeSessions,
                      input: { userId: selected.userId },
                    },
                  ]
                : []),
              ...(selected.status === "suspended"
                ? [
                    {
                      action: deletePerson,
                      input: { userId: selected.userId },
                    },
                  ]
                : []),
            ],
          },
          ...(selected.isSelf ? [accountLinkBlock()] : []),
          ...(suspensionProtection && selected.status === "active"
            ? [warningBlock(suspensionProtection)]
            : []),
        ],
      });
      openBlocks.push({
        type: "card",
        id: "person-sign-in",
        label: "Sign-in",
        blocks: [
          {
            type: "table",
            id: "person-passkeys",
            empty: "No passkeys registered.",
            columns: [
              { key: "kind", label: "Passkey" },
              { key: "created", label: "Added" },
            ],
            rows: selected.passkeys.map((passkey) => ({
              id: passkey.id,
              cells: {
                kind: passkey.kind,
                created: formatWorkspaceDate(passkey.createdAt),
              },
              compact: {
                title: passkey.kind,
                metadata: [`Added ${formatWorkspaceDate(passkey.createdAt)}`],
              },
              actions:
                selected.status === "active" && !selected.isSelf
                  ? [
                      {
                        action: revokePasskey,
                        input: {
                          userId: selected.userId,
                          credentialId: passkey.id,
                        },
                      },
                    ]
                  : [],
            })),
          },
          ...(selected.status === "active" && !selected.isSelf
            ? selected.identities.some((identity) => identity.verified)
              ? [setupActionBlock(selected.userId)]
              : [
                  warningBlock(
                    "A verified channel is required for setup delivery.",
                  ),
                ]
            : []),
        ],
      });
      openBlocks.push({
        type: "card",
        id: "person-channels",
        label: "Connected channels",
        blocks: [
          {
            type: "table",
            id: "person-identities",
            empty: "No connected channel.",
            columns: [
              { key: "channel", label: "Channel" },
              { key: "identity", label: "Identity" },
              { key: "assurance", label: "Assurance" },
            ],
            rows: selected.identities.map((identity) => ({
              id: identity.id,
              cells: {
                channel: identity.displayName,
                identity: identity.label,
                assurance: identity.verified ? "Verified" : "Asserted",
              },
              compact: {
                title: identity.label,
                metadata: [identity.displayName],
                badges: [
                  {
                    label: identity.verified ? "Verified" : "Asserted",
                    tone: identity.verified ? "good" : "neutral",
                  },
                ],
              },
              actions: [
                {
                  action: detachIdentity,
                  input: {
                    userId: selected.userId,
                    identityId: identity.id,
                  },
                },
              ],
            })),
          },
          ...(data.channelTypes.length > 0
            ? [attachIdentityActionBlock(selected.userId, data.channelTypes)]
            : [warningBlock("No attachable channel type is configured.")]),
        ],
      });
      openBlocks.push({
        type: "notice",
        tone: "neutral",
        text: "External peer links record provenance from another brain. They do not grant or change this person's local access.",
      });
      openBlocks.push({
        type: "list",
        id: "person-peers",
        empty: "No external peer linked; this person is hosted locally.",
        items: selected.peers.map((peer) => ({
          id: peer.peerId,
          title: peerOriginLabel(peer.peerId),
          description: `Vouched in by ${peerOriginLabel(peer.peerId)} · ${peer.peerId}`,
          metadata: [titleCase(peer.verificationStatus)],
          actions: [
            {
              action: unlinkExternalPeer,
              input: { userId: selected.userId, peerId: peer.peerId },
            },
          ],
        })),
      });
    }

    const blocks: PeopleBlock[] = [
      {
        type: "stats",
        id: "people-summary",
        items: [
          { label: "Active members", value: data.activeCount },
          { label: "Active Admins", value: data.activeAdminCount },
          {
            label: "Suspended",
            value: data.suspendedCount,
            tone: data.suspendedCount > 0 ? "warn" : "neutral",
          },
        ],
      },
      {
        type: "card",
        id: "brain-anchor",
        label: "Brain Anchor",
        blocks: [
          {
            type: "key-values",
            items: [
              { label: "Name", value: data.anchor.displayName },
              { label: "Kind", value: data.anchor.configuredKind },
              { label: "Ownership", value: data.anchor.kind },
              { label: "Administered by", value: data.anchor.administeredBy },
            ],
          },
        ],
      },
      {
        type: "detail",
        id: "people",
        queryKey: "selected",
        empty: "Select a person to inspect their access.",
        master: {
          type: "table",
          id: "people-roster",
          empty: "No people are available.",
          columns: [
            { key: "person", label: "Person" },
            { key: "role", label: "Role" },
            { key: "status", label: "Status" },
            { key: "brain", label: "Arrived via" },
            { key: "signIn", label: "Sign-in" },
          ],
          rows: data.people.map((person) => ({
            id: person.userId,
            cells: {
              person: person.displayName,
              role: titleCase(person.role),
              status: titleCase(person.status),
              brain: peerOriginLabel(person.peers[0]?.peerId),
              signIn: signInSummary(
                person.passkeys.length,
                person.identities.length,
              ),
            },
            compact: {
              title: person.displayName,
              metadata: [
                titleCase(person.role),
                peerOriginLabel(person.peers[0]?.peerId),
                signInSummary(person.passkeys.length, person.identities.length),
              ],
              badges: [
                {
                  label: titleCase(person.status),
                  tone: person.status === "active" ? "good" : "warn",
                },
              ],
              tone: person.status === "suspended" ? "warn" : "neutral",
            },
            link: { detail: { itemId: person.userId } },
          })),
        },
        ...(selected
          ? {
              open: {
                forId: selected.userId,
                title: selected.displayName,
                blocks: openBlocks,
              },
            }
          : {}),
      },
    ];
    return {
      kicker: "Access administration",
      title: "People",
      description:
        "Inspect membership, sign-in, connected channels, and local access.",
      status: {
        label: `${data.activeCount} active`,
        tone: data.suspendedCount > 0 ? "warn" : "neutral",
      },
      blocks,
    };
  },
});

function mutationContext(caller: OperatorCaller | null): {
  actorUserId: string;
} {
  if (!caller) throw new Error("People action requires a signed-in actor");
  return { actorUserId: caller.actor.id };
}

function personName(
  users: Awaited<ReturnType<AuthAdministration["listAdminUsers"]>>,
  userId: string,
): string {
  return users.find((user) => user.userId === userId)?.displayName ?? "person";
}

async function loadBrainAnchor(
  authService: AuthAdministration,
): Promise<
  Awaited<ReturnType<AuthAdministration["getBrainAnchor"]>> | undefined
> {
  try {
    return await authService.getBrainAnchor();
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "Brain anchor is not configured"
    ) {
      return undefined;
    }
    throw error;
  }
}

export function createPeopleTabSource(
  context: ServicePluginContext,
): AdminWorkspaceSource {
  const authService = requireAuthService(context);
  const registration = createBuiltInStudioWorkspaceRegistration({
    context,
    definition: peopleWorkspace,
    bind: (bindingContext) => {
      const role = updateRole.bind(
        bindingContext,
        async ({ input, caller }) => {
          await authService.updateUserRole(
            input.userId,
            input.role,
            mutationContext(caller),
          );
          return { status: `Role changed to ${titleCase(input.role)}.` };
        },
        async ({ input }) => {
          const users = await authService.listAdminUsers();
          return {
            summary: `Change ${personName(users, input.userId)}’s role to ${titleCase(input.role)}?`,
            revision: `${input.userId}:${input.role}`,
          };
        },
      );
      const status = updateStatus.bind(
        bindingContext,
        async ({ input, caller }) => {
          await authService.updateUserStatus(
            input.userId,
            input.status,
            mutationContext(caller),
          );
          return { status: `Person ${input.status}.` };
        },
        async ({ input }) => {
          const users = await authService.listAdminUsers();
          return {
            summary: `${input.status === "active" ? "Reactivate" : "Suspend"} ${personName(users, input.userId)}?`,
            revision: `${input.userId}:${input.status}`,
          };
        },
      );
      const remove = deletePerson.bind(
        bindingContext,
        async ({ input, caller }) => {
          await authService.deleteSuspendedUser(
            input.userId,
            mutationContext(caller),
          );
          return { status: "Suspended person permanently deleted." };
        },
        async ({ input }) => {
          const users = await authService.listAdminUsers();
          return {
            summary: `Permanently delete ${personName(users, input.userId)}? Audit history is retained.`,
            revision: input.userId,
          };
        },
      );
      const passkey = revokePasskey.bind(
        bindingContext,
        async ({ input, caller }) => {
          await authService.revokePasskey(
            input.credentialId,
            mutationContext(caller),
          );
          return { status: "Passkey revoked." };
        },
        ({ input }) => ({
          summary: "Revoke this passkey immediately?",
          revision: `${input.userId}:${input.credentialId}`,
        }),
      );
      const setup = startPasskeyRegistration.bind(
        bindingContext,
        async ({ input, caller }) => {
          const registration =
            await authService.startPasskeyRegistrationForUser(
              input.userId,
              mutationContext(caller),
            );
          return {
            status: `Bound to ${registration.delivery.label}. Deliver only through that confirmed private channel.`,
            setupUrl: registration.setupUrl,
            expiresAt: new Date(registration.expiresAt * 1_000).toISOString(),
          };
        },
      );
      const sessions = revokeSessions.bind(
        bindingContext,
        async ({ input, caller }) => {
          const revoked = await authService.revokeUserSessionsAndRefreshTokens(
            input.userId,
            mutationContext(caller),
          );
          return {
            status: `Revoked ${revoked.sessions} sessions and ${revoked.refreshTokens} refresh tokens.`,
          };
        },
        async ({ input }) => {
          const users = await authService.listAdminUsers();
          return {
            summary: `Sign ${personName(users, input.userId)} out everywhere?`,
            revision: input.userId,
          };
        },
      );
      const attach = attachIdentity.bind(
        bindingContext,
        async ({ input, caller }) => {
          await authService.attachIdentity(
            {
              userId: input.userId,
              type: input.type,
              subject: input.subject,
              ...(input.issuer ? { issuer: input.issuer } : {}),
              ...(input.label ? { label: input.label } : {}),
              verifiedAt: Date.now(),
              source: { kind: "admin" },
            },
            mutationContext(caller),
          );
          return { status: "Verified channel attached." };
        },
      );
      const detach = detachIdentity.bind(
        bindingContext,
        async ({ input, caller }) => {
          await authService.detachIdentity(
            input.identityId,
            mutationContext(caller),
          );
          return { status: "Channel detached." };
        },
        ({ input }) => ({
          summary: "Detach this channel identity?",
          revision: `${input.userId}:${input.identityId}`,
        }),
      );
      const unlink = unlinkExternalPeer.bind(
        bindingContext,
        async ({ input, caller }) => {
          await authService.unlinkExternalPeer(input, mutationContext(caller));
          return { status: "External peer unlinked from the local person." };
        },
        ({ input }) => ({
          summary: `Unlink ${input.peerId}? Local access will not change.`,
          revision: `${input.peerId}:${input.userId}`,
        }),
      );
      return peopleWorkspace.bind(bindingContext, {
        actions: [
          role,
          status,
          remove,
          passkey,
          setup,
          sessions,
          attach,
          detach,
          unlink,
        ],
        load: async ({ query, caller }) => {
          const normalized = query.get(peopleQuerySchema);
          const [configuredAnchor, users, channels] = await Promise.all([
            loadBrainAnchor(authService),
            authService.listAdminUsers(),
            authService.listInvitationChannels(),
          ]);
          const people = users.filter((user) => user.status !== "invited");
          const fallbackAnchor =
            people.find((user) => user.isAnchor) ??
            people.find(
              (user) => user.role === "admin" && user.status === "active",
            );
          const anchor =
            configuredAnchor ??
            defaultAnchor(
              fallbackAnchor?.displayName ?? "Brain owner",
              people.filter(
                (user) => user.role === "admin" && user.status === "active",
              ).length,
            );
          const active = people.filter((user) => user.status === "active");
          const channelNames = new Map(
            channels.map((channel) => [channel.type, channel.displayName]),
          );
          return {
            query: normalized,
            anchor: {
              kind: anchor.kind,
              configuredKind: anchor.configuredKind,
              displayName: anchor.displayName,
              administeredBy: anchor.administeredBy,
            },
            people: people.flatMap((user) => {
              if (user.status === "invited") return [];
              return [
                {
                  userId: user.userId,
                  displayName: user.displayName,
                  role: user.role,
                  status: user.status,
                  isAnchor: user.isAnchor,
                  isSelf: caller?.actor.id === user.userId,
                  ...(user.profileEntityId
                    ? { profileEntityId: user.profileEntityId }
                    : {}),
                  passkeys: user.passkeys.map((passkey) => ({
                    id: passkey.id,
                    kind: passkey.credentialDeviceType ?? "Passkey",
                    createdAt: passkey.createdAt,
                  })),
                  identities: user.identities
                    .filter((identity) => identity.revokedAt === undefined)
                    .map((identity) => ({
                      id: identity.id,
                      type: identity.type,
                      displayName:
                        channelNames.get(identity.type) ??
                        titleCase(identity.type),
                      label: identity.label ?? "Connected identity",
                      verified: identity.verifiedAt !== undefined,
                    })),
                  peers: user.externalPeers.map((peer) => ({
                    peerId: peer.peerId,
                    verificationStatus: peer.verificationStatus,
                  })),
                },
              ];
            }),
            activeCount: active.length,
            activeAdminCount: active.filter((user) => user.role === "admin")
              .length,
            suspendedCount: people.length - active.length,
            channelTypes: channels.map((channel) => ({
              type: channel.type,
              displayName: channel.displayName,
            })),
          };
        },
      });
    },
  });
  return adminWorkspaceSource(registration, peopleWorkspace.actions);
}
