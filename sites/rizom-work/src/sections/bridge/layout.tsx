import type { JSX } from "preact";
import { Section } from "@rizom/ui";
import { WORK_KICKER, WORK_RULE } from "../styles";
import type { BridgeContent } from "./schema";

export const BridgeLayout = ({
  kicker,
  body,
  linkLabel,
  linkHref,
}: BridgeContent): JSX.Element => {
  return (
    <Section
      id="bridge"
      className="reveal pt-20 pb-24 text-center max-[768px]:pt-14 max-[768px]:pb-[72px]"
    >
      <div className={`${WORK_RULE} mb-12`} />
      <span className={`${WORK_KICKER} mb-4 justify-center`}>{kicker}</span>
      <p className="mx-auto mb-7 max-w-[760px] font-display text-[clamp(22px,2.6vw,32px)] italic leading-[1.4] text-theme max-[768px]:text-[19px] max-[768px]:leading-[1.42]">
        {body}
      </p>
      <a
        href={linkHref}
        className="inline-flex border-b border-accent pb-[3px] font-body text-[15px] font-medium text-accent transition-all hover:pb-[5px]"
      >
        {linkLabel}
      </a>
    </Section>
  );
};
