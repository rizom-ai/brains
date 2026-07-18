import type { AuthAdminIdentityType } from "@brains/auth-service/admin-contracts";
import type { ReactElement } from "react";
import { Button } from "../components/primitives";
import { roleLabel } from "../format";
import type { ManualIdentityType } from "../identity-providers";
import { ModalFrame } from "./ModalFrame";

export function IdentityDialog(props: {
  identityTypes: ManualIdentityType[];
  onClose: () => void;
  onAttach: (input: {
    type: Exclude<AuthAdminIdentityType, "passkey">;
    subject: string;
    issuer?: string;
    label?: string;
  }) => Promise<void>;
}): ReactElement {
  return (
    <ModalFrame
      eyebrow="Advanced recognition"
      title="Attach unverified identity"
      copy="Record a provider claim for reconciliation only. This does not verify or authenticate the person."
      onClose={props.onClose}
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        const issuer = String(data.get("issuer") ?? "").trim();
        const label = String(data.get("label") ?? "").trim();
        void props.onAttach({
          type: String(data.get("type")) as Exclude<
            AuthAdminIdentityType,
            "passkey"
          >,
          subject: String(data.get("subject") ?? ""),
          ...(issuer ? { issuer } : {}),
          ...(label ? { label } : {}),
        });
      }}
      footer={
        <>
          <Button type="button" onClick={props.onClose}>
            Cancel
          </Button>
          <Button type="submit" tone="primary">
            Attach unverified identity
          </Button>
        </>
      }
    >
      <label>
        <span>Identity type</span>
        <select name="type" defaultValue={props.identityTypes[0]}>
          {props.identityTypes.map((type) => (
            <option key={type} value={type}>
              {roleLabel(type)}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>Provider subject</span>
        <input name="subject" maxLength={2000} required autoFocus />
      </label>
      <label>
        <span>Issuer (optional)</span>
        <input name="issuer" maxLength={2000} />
      </label>
      <label>
        <span>Safe display label (optional)</span>
        <input name="label" maxLength={200} />
      </label>
      <p className="people-warning">
        This creates an unverified claim that cannot authenticate this person.
        Provider subjects remain private in auth storage and are never shown in
        this console.
      </p>
    </ModalFrame>
  );
}
