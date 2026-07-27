import type {
  AuthAdminRole,
  AuthInvitationChannelSummary,
  AuthInvitationDeliveryMode,
  AuthSetupDeliveryInput,
} from "@brains/auth-service/admin-contracts";
import { useRef, useState, type ReactElement } from "react";
import { Button } from "../components/primitives";
import type { ExternalPeerInvitationDraft } from "../people-types";
import { ModalFrame } from "./ModalFrame";

export interface AddPersonInput {
  idempotencyKey: string;
  displayName: string;
  role: Extract<AuthAdminRole, "admin" | "trusted">;
  delivery: AuthSetupDeliveryInput;
  peerId?: string;
}

export interface SubmissionLock {
  current: boolean;
}

export async function runSingleSubmission(
  lock: SubmissionLock,
  operation: () => Promise<void>,
): Promise<boolean> {
  if (lock.current) return false;
  lock.current = true;
  try {
    await operation();
    return true;
  } finally {
    lock.current = false;
  }
}

export function AddPersonDialog(props: {
  channels: AuthInvitationChannelSummary[];
  initialDraft?: ExternalPeerInvitationDraft;
  onClose: () => void;
  onCreate: (input: AddPersonInput) => Promise<void>;
}): ReactElement {
  const initialChannel = props.channels[0];
  const [deliveryType, setDeliveryType] = useState(initialChannel?.type ?? "");
  const [deliveryMode, setDeliveryMode] = useState<AuthInvitationDeliveryMode>(
    initialChannel?.deliveryModes[0] ?? "automatic",
  );
  const [submitting, setSubmitting] = useState(false);
  const submissionLock = useRef(false);
  const idempotencyKey = useRef(globalThis.crypto.randomUUID()).current;
  const selectedChannel =
    props.channels.find((channel) => channel.type === deliveryType) ??
    initialChannel;

  return (
    <ModalFrame
      eyebrow="New invitation"
      title="Add a person"
      copy="Link an external brain when one exists, or create a hosted account without a profile."
      onClose={props.onClose}
      onSubmit={(event) => {
        event.preventDefault();
        if (submissionLock.current || !selectedChannel) return;
        const data = new FormData(event.currentTarget);
        const peerId = String(data.get("peerId") ?? "").trim();
        const subject = String(data.get("deliverySubject") ?? "").trim();
        const roleValue = String(data.get("role") ?? "trusted");
        const role = roleValue === "admin" ? "admin" : "trusted";
        const delivery: AuthSetupDeliveryInput = {
          type: selectedChannel.type,
          subject,
          mode: deliveryMode,
        };
        const input = {
          idempotencyKey,
          displayName: String(data.get("displayName") ?? "").trim(),
          role,
          delivery,
          ...(peerId ? { peerId } : {}),
        } satisfies AddPersonInput;
        setSubmitting(true);
        void runSingleSubmission(submissionLock, () => props.onCreate(input))
          .catch(() => undefined)
          .finally(() => setSubmitting(false));
      }}
      footer={
        <>
          <Button type="button" onClick={props.onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            type="submit"
            tone="primary"
            disabled={submitting || !selectedChannel}
          >
            {submitting ? "Creating…" : "Create invitation"}
          </Button>
        </>
      }
    >
      <label>
        <span>Display name</span>
        <input
          name="displayName"
          maxLength={200}
          defaultValue={props.initialDraft?.displayName ?? ""}
          required
          autoFocus
        />
      </label>
      <label>
        <span>
          External brain ID or URL <small>optional</small>
        </span>
        <input
          name="peerId"
          maxLength={2000}
          placeholder="did:web:person.example"
          defaultValue={props.initialDraft?.peerId ?? ""}
        />
      </label>
      {selectedChannel ? (
        <>
          <label>
            <span>Delivery channel</span>
            <select
              name="deliveryType"
              value={selectedChannel.type}
              onChange={(event) => {
                const nextType = event.currentTarget.value;
                const nextChannel = props.channels.find(
                  (channel) => channel.type === nextType,
                );
                if (!nextChannel) return;
                setDeliveryType(nextChannel.type);
                setDeliveryMode(nextChannel.deliveryModes[0] ?? "automatic");
              }}
            >
              {props.channels.map((channel) => (
                <option key={channel.type} value={channel.type}>
                  {channel.displayName}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>{selectedChannel.subjectLabel}</span>
            <input
              name="deliverySubject"
              maxLength={1000}
              {...(selectedChannel.subjectPattern
                ? { pattern: selectedChannel.subjectPattern.source }
                : {})}
              required
            />
          </label>
          {selectedChannel.deliveryModes.length > 1 ? (
            <label>
              <span>Delivery method</span>
              <select
                name="deliveryMode"
                value={deliveryMode}
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  if (value === "automatic" || value === "manual") {
                    setDeliveryMode(value);
                  }
                }}
              >
                {selectedChannel.deliveryModes.map((mode) => (
                  <option key={mode} value={mode}>
                    {mode === "automatic"
                      ? "Send automatically"
                      : "I will deliver the setup link"}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </>
      ) : (
        <p className="people-warning">
          No invitation delivery channel is currently available.
        </p>
      )}
      <label>
        <span>Intended role</span>
        <select name="role" defaultValue="trusted">
          <option value="trusted">Trusted</option>
          <option value="admin">Admin</option>
        </select>
      </label>
      <p className="people-warning">
        The external brain remains an independent peer. Linking it never grants
        that peer the person’s role or attribution.
      </p>
    </ModalFrame>
  );
}
