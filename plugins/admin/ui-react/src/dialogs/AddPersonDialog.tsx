import {
  AUTH_USER_ROLES,
  type AuthAdminRole,
} from "@brains/auth-service/admin-contracts";
import type { ReactElement } from "react";
import { roleLabel } from "../format";
import { Button } from "../components/primitives";
import { ModalFrame } from "./ModalFrame";

export function AddPersonDialog(props: {
  onClose: () => void;
  onCreate: (displayName: string, role: AuthAdminRole) => Promise<void>;
}): ReactElement {
  return (
    <ModalFrame
      eyebrow="New access"
      title="Add a person"
      copy="Create access first; attach an identity or passkey next."
      onClose={props.onClose}
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        void props.onCreate(
          String(data.get("displayName") ?? ""),
          String(data.get("role") ?? "trusted") as AuthAdminRole,
        );
      }}
      footer={
        <>
          <Button type="button" onClick={props.onClose}>
            Cancel
          </Button>
          <Button type="submit" tone="primary">
            Create person
          </Button>
        </>
      }
    >
      <label>
        <span>Display name</span>
        <input name="displayName" maxLength={200} required autoFocus />
      </label>
      <label>
        <span>Initial role</span>
        <select name="role" defaultValue="trusted">
          {AUTH_USER_ROLES.map((role) => (
            <option key={role} value={role}>
              {roleLabel(role)}
            </option>
          ))}
        </select>
      </label>
      <p className="people-warning">
        Adding an Anchor grants full administration and restricted-content
        access.
      </p>
    </ModalFrame>
  );
}
