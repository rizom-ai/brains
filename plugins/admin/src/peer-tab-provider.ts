import type {
  AnyWorkspaceActionDefinition,
  StudioWorkspaceView,
  AuthAdministration,
} from "@brains/sdk/services";
import {
  defineStudioWorkspace,
  defineWorkspaceAction,
  type OperatorCaller,
  type OperatorRegionBlock,
  type OperatorViewBlock,
  type StudioWorkspaceViewBlock,
} from "@brains/plugins";
import { z } from "@brains/utils/zod";

type ViewBlock = StudioWorkspaceViewBlock<AnyWorkspaceActionDefinition>;
type RegionBlock = OperatorRegionBlock<AnyWorkspaceActionDefinition>;
import {
  adminUserOptions,
  formatWorkspaceDate,
  peerOriginLabel,
  type AdminTabFactory,
} from "./workspace-format";

// Parsed from the Administration workspace query, which is a superset of
// every tab s fields; unknown keys belong to other tabs.
const peersQuerySchema = z.object({
  peerId: z.string().trim().max(2_000).optional(),
  displayName: z.string().trim().max(200).optional(),
});
const inviteInputSchema = z.strictObject({
  peerId: z.string().trim().min(1).max(2_000),
  displayName: z.string().trim().min(1).max(200),
  role: z.enum(["admin", "trusted"]),
  deliveryType: z.string().trim().min(1).max(64),
  deliverySubject: z.string().trim().min(1).max(1_000),
  deliveryLabel: z.string().trim().min(1).max(200).optional(),
  deliveryMode: z.enum(["automatic", "manual"]),
});
const linkInputSchema = z.strictObject({
  peerId: z.string().trim().min(1).max(2_000),
  userId: z.string().min(1),
});
const setupResultSchema = z.strictObject({
  status: z.string(),
  setupUrl: z.url(),
  expiresAt: z.string(),
});
const statusResultSchema = z.strictObject({ status: z.string() });

function titleCase(value: string): string {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}

const invitePeer = defineWorkspaceAction({
  name: "invite-external-peer-person",
  label: "Invite peer person",
  permission: "admin",
  confirmation: {
    kind: "static",
    message: "Create this local member and bind them to the external peer?",
  },
  input: inviteInputSchema,
  output: setupResultSchema,
});
const linkPeer = defineWorkspaceAction({
  name: "link-external-peer",
  label: "Link peer to person",
  permission: "admin",
  confirmation: { kind: "prepared" },
  input: linkInputSchema,
  output: statusResultSchema,
});

const peersDataSchema = z.strictObject({
  query: peersQuerySchema,
  peers: z.array(
    z.strictObject({
      peerId: z.string(),
      displayName: z.string(),
      role: z.enum(["admin", "trusted", "public"]),
      verificationStatus: z.enum(["unverified", "verified"]),
      createdAt: z.number(),
    }),
  ),
  people: z.array(
    z.strictObject({ userId: z.string(), displayName: z.string() }),
  ),
  channels: z.array(
    z.strictObject({
      type: z.string(),
      displayName: z.string(),
      subjectLabel: z.string(),
      deliveryModes: z.array(z.enum(["automatic", "manual"])),
    }),
  ),
});

type PeerAction = typeof invitePeer | typeof linkPeer;
type PeerBlock = OperatorViewBlock<PeerAction>;

function requiredPeerRegion(
  blocks: readonly ViewBlock[],
  id: string,
): RegionBlock {
  const matches = blocks.filter((block) => block.id === id);
  if (matches.length !== 1) {
    throw new Error(`Peer tab composition requires block "${id}" exactly once`);
  }
  const block = matches[0];
  if (!block) {
    throw new Error(`Peer tab composition requires block "${id}" exactly once`);
  }
  switch (block.type) {
    case "tabs":
    case "detail":
    case "columns":
      throw new Error(`Peer tab composition block "${id}" must be a region`);
    default:
      return block;
  }
}

export function selectPeerTabSections(blocks: readonly ViewBlock[]): {
  readonly people: readonly RegionBlock[];
  readonly invitations: readonly RegionBlock[];
} {
  const inviteId = blocks.some((block) => block.id === "invite-peer")
    ? "invite-peer"
    : "invite-peer-unavailable";
  return {
    people: [
      requiredPeerRegion(blocks, "link-peer"),
      requiredPeerRegion(blocks, "peers"),
    ],
    invitations: [requiredPeerRegion(blocks, inviteId)],
  };
}

const setupResultPresentation = {
  title: "Peer invitation setup",
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

const peerTabProvider = defineStudioWorkspace({
  id: "peers",
  label: "Peers",
  priority: 12,
  permission: "admin",
  query: peersQuerySchema,
  data: peersDataSchema,
  actions: [invitePeer, linkPeer],
  view: ({ data }) => {
    const deliveryModes = Array.from(
      new Set(data.channels.flatMap((channel) => channel.deliveryModes)),
    );
    const blocks: PeerBlock[] = [
      {
        type: "stats",
        id: "peer-summary",
        items: [
          { label: "Linked peers", value: data.peers.length },
          {
            label: "Verified",
            value: data.peers.filter(
              (peer) => peer.verificationStatus === "verified",
            ).length,
          },
          { label: "Available people", value: data.people.length },
        ],
      },
    ];
    if (data.channels.length > 0 && deliveryModes.length > 0) {
      blocks.push({
        type: "card",
        id: "invite-peer",
        label: "Peer-first invitation",
        blocks: [
          {
            type: "text",
            text: "Create a local member for a person known first through another brain, then issue their single-use passkey setup link.",
          },
          {
            type: "action",
            action: invitePeer,
            input: {
              ...(data.query.peerId ? { peerId: data.query.peerId } : {}),
              ...(data.query.displayName
                ? { displayName: data.query.displayName }
                : {}),
            },
            form: {
              presentation: "disclosure",
              submitLabel: "Invite peer person",
              fields: {
                peerId: { label: "External peer ID", control: "text" },
                displayName: { label: "Display name", control: "text" },
                role: {
                  label: "Local role",
                  control: "select",
                  options: [
                    { value: "trusted", label: "Trusted" },
                    { value: "admin", label: "Admin" },
                  ],
                },
                deliveryType: {
                  label: "Delivery channel",
                  control: "select",
                  options: data.channels.map((channel) => ({
                    value: channel.type,
                    label: channel.displayName,
                  })),
                },
                deliverySubject: {
                  label: "Delivery destination",
                  labelBy: {
                    field: "deliveryType",
                    values: data.channels.map((channel) => ({
                      value: channel.type,
                      label: channel.subjectLabel,
                    })),
                  },
                  control: "text",
                },
                deliveryLabel: {
                  label: "Delivery label (optional)",
                  control: "text",
                },
                deliveryMode: {
                  label: "Delivery mode",
                  control: "select",
                  options: deliveryModes.map((mode) => ({
                    value: mode,
                    label: mode === "automatic" ? "Automatic" : "Manual",
                  })),
                },
              },
            },
            result: setupResultPresentation,
          },
        ],
      });
    } else {
      blocks.push({
        type: "notice",
        id: "invite-peer-unavailable",
        tone: "warn",
        text: "No invitation delivery channel is currently available.",
      });
    }
    blocks.push(
      {
        type: "card",
        id: "link-peer",
        label: "Link an existing person",
        blocks: [
          {
            type: "action",
            action: linkPeer,
            input: {
              ...(data.query.peerId ? { peerId: data.query.peerId } : {}),
            },
            form: {
              submitLabel: "Link peer",
              fields: {
                peerId: { label: "External peer ID", control: "text" },
                userId: {
                  label: "Local person",
                  control: "select",
                  options: data.people.map((person) => ({
                    value: person.userId,
                    label: person.displayName,
                  })),
                },
              },
            },
          },
        ],
      },
      {
        type: "table",
        id: "peers",
        empty: "No external peers linked.",
        columns: [
          { key: "peer", label: "Peer" },
          { key: "person", label: "Local person" },
          { key: "role", label: "Local role" },
          { key: "verification", label: "Verification" },
          { key: "linked", label: "Linked" },
        ],
        rows: data.peers.map((peer) => ({
          id: `${peer.peerId}:${peer.displayName}`,
          cells: {
            peer: peerOriginLabel(peer.peerId),
            person: peer.displayName,
            role: peer.role,
            verification: peer.verificationStatus,
            linked: formatWorkspaceDate(peer.createdAt),
          },
          compact: {
            title: peerOriginLabel(peer.peerId),
            metadata: [
              peer.displayName,
              titleCase(peer.role),
              formatWorkspaceDate(peer.createdAt),
            ],
            badges: [
              {
                label: titleCase(peer.verificationStatus),
                tone: peer.verificationStatus === "verified" ? "good" : "warn",
              },
            ],
          },
        })),
      },
    );
    return {
      kicker: "Network administration",
      title: "Peers",
      description:
        "List external brain relationships, invite peer-first people, and link known peers to existing members.",
      status: { label: `${data.peers.length} linked` },
      blocks,
    };
  },
});

function mutationContext(caller: OperatorCaller | null): {
  actorUserId: string;
} {
  if (!caller) throw new Error("Peer action requires a signed-in actor");
  return { actorUserId: caller.actor.id };
}

export function createPeerTab(
  authService: AuthAdministration,
): AdminTabFactory {
  return (bindingContext) => {
    const invite = invitePeer.bind(
      bindingContext,
      async ({ input, caller }) => {
        const access = await authService.inviteExternalPeerPerson(
          {
            peerId: input.peerId,
            displayName: input.displayName,
            role: input.role,
            delivery: {
              type: input.deliveryType,
              subject: input.deliverySubject,
              ...(input.deliveryLabel ? { label: input.deliveryLabel } : {}),
              mode: input.deliveryMode,
            },
          },
          mutationContext(caller),
        );
        return {
          status: `Created ${access.user.displayName} and linked ${access.peer.peerId}. Deliver only through ${access.registration.delivery.label}.`,
          setupUrl: access.registration.setupUrl,
          expiresAt: new Date(
            access.registration.expiresAt * 1_000,
          ).toISOString(),
        };
      },
    );
    const link = linkPeer.bind(
      bindingContext,
      async ({ input, caller }) => {
        await authService.linkExternalPeer(
          { peerId: input.peerId, userId: input.userId },
          mutationContext(caller),
        );
        return { status: "External peer linked to the local person." };
      },
      async ({ input }) => {
        const users = await authService.listAdminUsers();
        const displayName =
          users.find((user) => user.userId === input.userId)?.displayName ??
          "person";
        return {
          summary: `Link ${input.peerId} to ${displayName}? Local access does not change.`,
          revision: `${input.peerId}:${input.userId}`,
        };
      },
    );
    return {
      actions: [invite, link],
      load: async ({
        query,
      }): Promise<StudioWorkspaceView<AnyWorkspaceActionDefinition>> => {
        const normalized = peersQuerySchema.parse(query);
        const [users, channels] = await Promise.all([
          authService.listAdminUsers(),
          authService.listInvitationChannels(),
        ]);
        const people = users.filter((user) => user.status !== "invited");
        const data = {
          query: normalized,
          peers: users.flatMap((user) =>
            user.externalPeers.map((peer) => ({
              peerId: peer.peerId,
              displayName: user.displayName,
              role: user.role,
              verificationStatus: peer.verificationStatus,
              createdAt: peer.createdAt,
            })),
          ),
          people: adminUserOptions(people),
          channels: channels
            .filter((channel) => channel.deliveryModes.length > 0)
            .map((channel) => ({
              type: channel.type,
              displayName: channel.displayName,
              subjectLabel: channel.subjectLabel,
              deliveryModes: channel.deliveryModes,
            })),
        };
        return peerTabProvider.view({ data });
      },
    };
  };
}

/** The action definitions this tab contributes to Administration. */
export const peerTabActions: readonly AnyWorkspaceActionDefinition[] =
  peerTabProvider.actions;
