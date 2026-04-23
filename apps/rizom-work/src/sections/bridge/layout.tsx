import type { JSX } from "preact";
import { Divider, Section } from "@rizom/ui";
import { WORK_SECTION_KICKER } from "../styles";
import type { BridgeContent } from "./schema";

export const BridgeLayout = ({
  kicker,
  body,
  linkLabel,
  linkHref,
}: BridgeContent): JSX.Element => {
  return (
    <Section id="bridge" className="reveal py-section text-center">
      <Divider className="mb-8 md:mb-10" />
      <span className={`${WORK_SECTION_KICKER} mb-4`}>{kicker}</span>
      <p className="max-w-[760px] mx-auto text-body-sm md:text-body-md text-theme-muted">
        {body}
      </p>
      <a
        href={linkHref}
        className="inline-flex mt-6 md:mt-7 font-body text-body-sm md:text-body-md text-theme hover:text-accent transition-colors"
      >
        {linkLabel}
      </a>
    </Section>
  );
};
