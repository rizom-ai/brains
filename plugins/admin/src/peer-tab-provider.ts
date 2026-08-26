import {
  createBuiltInStudioWorkspaceRegistration,
  defineStudioWorkspace,
  defineWorkspaceAction,
  type OperatorCaller,
  type OperatorViewBlock,
  type ServicePluginContext,
} from "@brains/plugins";
import { z } from "@brains/utils/zod";
import {
  adminUserOptions,
  formatWorkspaceDate,
  requireAuthService,
  type AdminWorkspaceRegistration,
} from "./workspace-format";

const peersQuerySchema = z.strictObject({
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
      deliveryModes: z.array(z.enum(["automatic", "manual"])),
    }),
  ),
});

type PeerAction = typeof invitePeer | typeof linkPeer;
type PeerBlock = OperatorViewBlock<PeerAction>;

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
                  label: "Delivery address or subject",
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
            peer: peer.peerId,
            person: peer.displayName,
            role: peer.role,
            verification: peer.verificationStatus,
            linked: formatWorkspaceDate(peer.createdAt),
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

export function createPeerTabRegistration(
  context: ServicePluginContext,
): AdminWorkspaceRegistration {
  const authService = requireAuthService();
  return createBuiltInStudioWorkspaceRegistration({
    context,
    definition: peerTabProvider,
    bind: (bindingContext) => {
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
      return peerTabProvider.bind(bindingContext, {
        actions: [invite, link],
        load: async ({ query }) => {
          const normalized = query.get(peersQuerySchema);
          const [users, channels] = await Promise.all([
            authService.listAdminUsers(),
            authService.listInvitationChannels(),
          ]);
          const people = users.filter((user) => user.status !== "invited");
          return {
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
                deliveryModes: channel.deliveryModes,
              })),
          };
        },
      });
    },
  });
}
