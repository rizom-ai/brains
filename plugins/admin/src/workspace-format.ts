import type {
  BoundWorkspaceAction,
  OperatorBindingContext,
  OperatorCaller,
  StudioWorkspaceView,
  StudioWorkspaceViewBlock,
  AnyWorkspaceActionDefinition,
} from "@brains/plugins";
import type {
  AuthAdminUserSummary,
  AuthAdministration,
} from "@brains/auth-service";

/** Blocks a tab contributes; the composite refuses nested tabs. */
export type AdminTabBlock<
  TAction extends AnyWorkspaceActionDefinition = AnyWorkspaceActionDefinition,
> = Exclude<StudioWorkspaceViewBlock<TAction>, { type: "tabs" }>;

/**
 * One tab of the Administration workspace.
 *
 * A tab is not a workspace: it loads its own blocks and brings its own
 * actions, and the workspace they belong to composes them. They were four
 * separate registrations stitched together by hand until the declarative
 * surface could express a workspace with tabs.
 */
export interface AdminTab {
  load(input: {
    /** The workspace query, already validated by the runtime. */
    readonly query: Readonly<Record<string, unknown>>;
    readonly caller: OperatorCaller | null;
    readonly signal: AbortSignal;
  }): Promise<StudioWorkspaceView<AnyWorkspaceActionDefinition>>;
  readonly actions: readonly BoundWorkspaceAction<
    AnyWorkspaceActionDefinition,
    Record<string, never>,
    AdminState,
    undefined
  >[];
}

/**
 * A tab contributes flat blocks. Nesting tabs inside tabs would render as a
 * control the console has no way to drive, so it is refused where it is
 * written rather than discovered in the browser.
 */
export function tabBlocks<TAction extends AnyWorkspaceActionDefinition>(
  blocks: readonly StudioWorkspaceViewBlock<TAction>[],
  label: string,
): AdminTabBlock<TAction>[] {
  return blocks.filter((block): block is AdminTabBlock<TAction> => {
    if (block.type === "tabs") {
      throw new Error(`${label} tab cannot contribute nested tabs`);
    }
    return true;
  });
}

/** Built once the workspace binding context exists. */
/** What the admin package holds while it runs. */
export interface AdminState {
  /** Absent in a brain that installs no auth-service. */
  readonly auth: AuthAdministration | undefined;
}

export type AdminTabFactory = (
  context: OperatorBindingContext<Record<string, never>, AdminState, undefined>,
) => AdminTab;

const workspaceDateFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
});

export function formatWorkspaceDate(timestamp: number): string {
  return workspaceDateFormatter.format(new Date(timestamp));
}

export function adminUserOptions(
  users: readonly Pick<
    AuthAdminUserSummary,
    "userId" | "displayName" | "status"
  >[],
): { userId: string; displayName: string }[] {
  return users.flatMap((user) =>
    user.status === "invited"
      ? []
      : [{ userId: user.userId, displayName: user.displayName }],
  );
}

/**
 * Where a person came from, in words an operator recognizes. Local members
 * belong to this brain; a vouching peer reads as its domain rather than the
 * raw identifier, since `did:web` encodes the domain it was issued for.
 * Identifiers with no readable form (`did:plc`, opaque handles) are shown
 * unchanged rather than mangled.
 */
export function peerOriginLabel(peerId: string | undefined): string {
  if (!peerId) return "This brain";
  const webPrefix = "did:web:";
  if (!peerId.startsWith(webPrefix)) return peerId;
  const encoded = peerId.slice(webPrefix.length);
  if (encoded.length === 0) return peerId;
  return encoded.split(":").map(decodeURIComponent).join("/");
}
