import type { FormEvent, ReactElement, ReactNode } from "react";

export function ModalFrame(props: {
  eyebrow: string;
  title: string;
  copy: string;
  children: ReactNode;
  footer: ReactNode;
  onClose: () => void;
  onSubmit?: (event: FormEvent<HTMLFormElement>) => void;
}): ReactElement {
  return (
    <div className="people-modal-layer" role="presentation">
      <dialog className="people-dialog" open aria-modal="true">
        <form
          onSubmit={props.onSubmit}
          onReset={(event) => {
            event.preventDefault();
            props.onClose();
          }}
        >
          <header>
            <div className="eyebrow">{props.eyebrow}</div>
            <h3>{props.title}</h3>
            <p>{props.copy}</p>
          </header>
          <div className="people-dialog-body">{props.children}</div>
          <footer>{props.footer}</footer>
        </form>
      </dialog>
    </div>
  );
}
