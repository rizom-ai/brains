import type {
  AuthAdminRole,
  AuthSetupDeliveryInput,
} from "@brains/auth-service/admin-contracts";
import { useState, type ReactElement } from "react";
import { Button } from "../components/primitives";
import type { ExternalPeerInvitationDraft } from "../people-types";
import { ModalFrame } from "./ModalFrame";

export interface AddPersonInput {
  displayName: string;
  role: Extract<AuthAdminRole, "admin" | "trusted">;
  delivery: AuthSetupDeliveryInput;
  peerId?: string;
}

export function AddPersonDialog(props: {
  initialDraft?: ExternalPeerInvitationDraft;
  onClose: () => void;
  onCreate: (input: AddPersonInput) => Promise<void>;
}): ReactElement {
  const [deliveryType, setDeliveryType] = useState<"email" | "discord">(
    "email",
  );

  return (
    <ModalFrame
      eyebrow="New invitation"
      title="Add a person"
      copy="Link an external brain when one exists, or create a hosted account without a profile."
      onClose={props.onClose}
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        const peerId = String(data.get("peerId") ?? "").trim();
        const deliverySubject = String(
          data.get("deliverySubject") ?? "",
        ).trim();
        const discordLabel = String(data.get("discordLabel") ?? "").trim();
        const delivery: AuthSetupDeliveryInput =
          deliveryType === "email"
            ? { type: "email", subject: deliverySubject }
            : {
                type: "discord",
                subject: deliverySubject,
                label: discordLabel,
              };
        void props.onCreate({
          displayName: String(data.get("displayName") ?? "").trim(),
          role: String(data.get("role") ?? "trusted") as AddPersonInput["role"],
          delivery,
          ...(peerId ? { peerId } : {}),
        });
      }}
      footer={
        <>
          <Button type="button" onClick={props.onClose}>
            Cancel
          </Button>
          <Button type="submit" tone="primary">
            Create invitation
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
      <label>
        <span>Delivery channel</span>
        <select
          name="deliveryType"
          value={deliveryType}
          onChange={(event) =>
            setDeliveryType(event.currentTarget.value as "email" | "discord")
          }
        >
          <option value="email">Email</option>
          <option value="discord">Discord</option>
        </select>
      </label>
      <label>
        <span>Email address or Discord user ID</span>
        <input
          name="deliverySubject"
          maxLength={deliveryType === "email" ? 320 : 200}
          type={deliveryType === "email" ? "email" : "text"}
          placeholder={
            deliveryType === "email"
              ? "person@example.com"
              : "1442828818493735015"
          }
          required
        />
      </label>
      <label hidden={deliveryType !== "discord"}>
        <span>Discord display handle</span>
        <input
          name="discordLabel"
          maxLength={200}
          placeholder="@person"
          required={deliveryType === "discord"}
        />
      </label>
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
