/** @jsxImportSource react */
import type { ReactElement } from "react";

/**
 * Where the answer will appear while it is being written. The line names the
 * work, not the person: the name is said once.
 */
export function GuestBoxPending(props: {
  owner: string | undefined;
}): ReactElement {
  return (
    <section
      className="guest-message guest-assistant brain-box-pending"
      aria-hidden="true"
    >
      <h2>{props.owner ?? "Brain"}</h2>
      <p className="brain-box-waiting">
        <span className="brain-box-dots">
          <i />
          <i />
          <i />
        </span>
        Looking through the published work
      </p>
    </section>
  );
}
