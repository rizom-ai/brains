/** @jsxImportSource react */
import { Button } from "@brains/app-ui-react";
import { useState, type ReactElement } from "react";
import { accountClass } from "../studio-account.styles";
import { AccountDetailSection } from "./account-primitives";
import { aiToolsStyles as s } from "../studio-ai-tools.styles";
import {
  aiToolClients,
  type AiToolClient,
  type AiToolText,
} from "./ai-tool-clients";

function Text(props: { text: AiToolText }): ReactElement {
  return (
    <>
      {props.text.map((run, index) =>
        typeof run === "string" ? (
          run
        ) : (
          <code key={index} className={accountClass("", s.code)}>
            {run.code}
          </code>
        ),
      )}
    </>
  );
}

function Snippet(props: { label: string; code: string }): ReactElement {
  const [copied, setCopied] = useState<"idle" | "copied" | "unavailable">(
    "idle",
  );
  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(props.code);
      setCopied("copied");
    } catch {
      // Clipboard may be missing or denied; the snippet stays selectable.
      setCopied("unavailable");
    }
  };
  return (
    <div className={accountClass("ai-tools-snippet", s.snippet)}>
      <pre className={accountClass("", s.snippetCode)} aria-label={props.label}>
        {props.code}
      </pre>
      <Button
        variant="outline"
        size="sm"
        onClick={() => void copy()}
        aria-label={`Copy ${props.label}`}
      >
        {copied === "copied"
          ? "Copied"
          : copied === "unavailable"
            ? "Select to copy"
            : "Copy"}
      </Button>
    </div>
  );
}

function ClientCard(props: { client: AiToolClient }): ReactElement {
  const { client } = props;
  return (
    <article className={accountClass("ai-tools-client", s.client)}>
      <h4 className={accountClass("", s.clientName)}>{client.name}</h4>
      {client.note ? (
        <p className={accountClass("", s.text)}>
          <Text text={client.note} />
        </p>
      ) : null}
      {client.steps ? (
        <ol className={accountClass("", s.steps)}>
          {client.steps.map((step, index) => (
            <li key={index}>
              <Text text={step} />
            </li>
          ))}
        </ol>
      ) : null}
      {client.fields ? (
        <dl className={accountClass("", s.fields)}>
          {client.fields.map((field) => (
            <div key={field.label} className={accountClass("", s.field)}>
              <dt className={accountClass("", s.fieldLabel)}>{field.label}</dt>
              <dd className={accountClass("", s.fieldValue)}>
                <Text text={field.value} />
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
      {client.lead?.map((paragraph, index) => (
        <p key={`lead-${index}`} className={accountClass("", s.text)}>
          <Text text={paragraph} />
        </p>
      ))}
      {client.snippet ? <Snippet {...client.snippet} /> : null}
      {client.after?.map((paragraph, index) => (
        <p key={`after-${index}`} className={accountClass("", s.text)}>
          <Text text={paragraph} />
        </p>
      ))}
    </article>
  );
}

function listInSentence(names: readonly string[]): string {
  return names.length < 2
    ? (names[0] ?? "")
    : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

/** How to connect the AI tools a person already uses to this brain over MCP. */
export function AccountAiToolsTab(props: { mcpUrl: string }): ReactElement {
  const clients = aiToolClients(props.mcpUrl);
  const primary = clients.filter((client) => client.group === "primary");
  const developer = clients.filter((client) => client.group === "developer");
  return (
    <AccountDetailSection
      title="AI tools"
      description="Connect AI tools you already use to this brain. A connected tool talks to the brain as you do in chat — asking, saving and updating within your access — after you sign in with your passkey."
    >
      <article className={accountClass("ai-tools-address", s.client)}>
        <h4 className={accountClass("", s.clientName)}>Your brain’s address</h4>
        <Snippet label="brain address" code={props.mcpUrl} />
      </article>
      <div className={accountClass("ai-tools-clients", s.clients)}>
        {primary.map((client) => (
          <ClientCard key={client.id} client={client} />
        ))}
      </div>
      <details className={accountClass("ai-tools-developer", s.developer)}>
        <summary className={accountClass("", s.developerSummary)}>
          Developer tools and other clients
          <span className={accountClass("", s.developerHint)}>
            {listInSentence(
              developer.map((client) => client.inlineName ?? client.name),
            )}
          </span>
        </summary>
        <div
          className={accountClass(
            "ai-tools-clients",
            s.clients,
            s.developerClients,
          )}
        >
          {developer.map((client) => (
            <ClientCard key={client.id} client={client} />
          ))}
        </div>
      </details>
    </AccountDetailSection>
  );
}
