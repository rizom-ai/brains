import type { AuthInterfacePrincipalGrantSummary } from "@brains/auth-service/admin-contracts";
import { useState, type FormEvent, type ReactElement } from "react";
import { Button, TextAction } from "./primitives";

export interface StandaloneGrantInput {
  interfaceType: string;
  subject: string;
  label: string;
  permissionLevel: "admin" | "trusted";
}

export function StandaloneAccessPanel(props: {
  grants: AuthInterfacePrincipalGrantSummary[];
  registeredInterfaces?: string[];
  onUpsert: (input: StandaloneGrantInput) => Promise<void>;
  onRevoke: (grant: AuthInterfacePrincipalGrantSummary) => void;
}): ReactElement {
  const [interfaceType, setInterfaceType] = useState(
    props.registeredInterfaces?.[0] ?? "discord",
  );
  const [subject, setSubject] = useState("");
  const [label, setLabel] = useState("");
  const [permissionLevel, setPermissionLevel] = useState<"admin" | "trusted">(
    "trusted",
  );
  const [submitting, setSubmitting] = useState(false);
  const interfaceSuggestions = Array.from(
    new Set([...(props.registeredInterfaces ?? []), "discord", "mcp"]),
  );

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    setSubmitting(true);
    void props
      .onUpsert({ interfaceType, subject, label, permissionLevel })
      .then(() => {
        setSubject("");
        setLabel("");
      })
      .catch(() => undefined)
      .finally(() => setSubmitting(false));
  };

  return (
    <section className="standalone-access card" aria-labelledby="access-title">
      <header className="standalone-access-head">
        <div>
          <div className="eyebrow">Unconnected interfaces</div>
          <h3 id="access-title">Standalone access</h3>
          <p>
            Exact grants apply only until the interface identity connects to a
            person. Connected account status and role always take precedence.
          </p>
        </div>
        <strong>{props.grants.length}</strong>
      </header>

      <div className="standalone-access-body">
        <form className="standalone-access-form" onSubmit={submit}>
          <label>
            <span>Label</span>
            <input
              value={label}
              maxLength={200}
              placeholder="Operations room"
              required
              onChange={(event) => setLabel(event.currentTarget.value)}
            />
          </label>
          <label>
            <span>Interface</span>
            <input
              list="standalone-interface-types"
              value={interfaceType}
              maxLength={64}
              placeholder="discord"
              pattern="[A-Za-z0-9][A-Za-z0-9_-]*"
              required
              onChange={(event) => setInterfaceType(event.currentTarget.value)}
            />
            <datalist id="standalone-interface-types">
              {interfaceSuggestions.map((value) => (
                <option key={value} value={value} />
              ))}
            </datalist>
          </label>
          <label>
            <span>Exact subject</span>
            <input
              value={subject}
              maxLength={2000}
              autoComplete="off"
              placeholder="Provider-specific ID"
              required
              onChange={(event) => setSubject(event.currentTarget.value)}
            />
            <small>Subject is hashed and never shown again.</small>
          </label>
          <label>
            <span>Permission</span>
            <select
              value={permissionLevel}
              onChange={(event) =>
                setPermissionLevel(
                  event.currentTarget.value as "admin" | "trusted",
                )
              }
            >
              <option value="trusted">Trusted</option>
              <option value="admin">Admin</option>
            </select>
          </label>
          <Button
            type="submit"
            tone="primary"
            disabled={
              submitting ||
              !interfaceType.trim() ||
              !subject.trim() ||
              !label.trim()
            }
          >
            {submitting ? "Saving…" : "Save exact grant"}
          </Button>
        </form>

        <div className="standalone-access-list">
          {props.grants.length === 0 ? (
            <p className="people-empty">No standalone grants.</p>
          ) : (
            props.grants.map((grant) => (
              <article className="standalone-access-row" key={grant.id}>
                <div>
                  <strong>{grant.label}</strong>
                  <small>
                    {grant.interfaceType} · {grant.source} · exact subject
                    hidden
                  </small>
                </div>
                <span
                  className={`people-role people-role--${grant.permissionLevel}`}
                >
                  {grant.permissionLevel}
                </span>
                <TextAction danger onClick={() => props.onRevoke(grant)}>
                  Revoke
                </TextAction>
              </article>
            ))
          )}
        </div>
      </div>
    </section>
  );
}
