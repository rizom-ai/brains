import type { JSX } from "preact";
import { Section } from "../../components/Section";
import { Badge } from "../../components/Badge";
import { Divider } from "../../components/Divider";

/**
 * Answer section — centered statement of the rizom thesis, with an
 * amber badge, headline, subhead, divider, and a 'scales' tagline.
 */
export const AnswerLayout = (): JSX.Element => {
  return (
    <Section id="answer" className="reveal text-center py-section">
      <Badge className="mb-7">The Answer</Badge>
      <h2 className="font-display text-display-md max-w-[900px] mx-auto mb-6 mt-7">
        A network of AI agents, each built from real knowledge
      </h2>
      <p className="text-body-md md:text-body-xl text-theme-muted max-w-[640px] mx-auto">
        Every professional gets an agent that knows what they know. Every team
        gets shared intelligence. The network connects them — matching expertise
        to opportunity, automatically.
      </p>
      <Divider className="my-10 md:my-12" />
      <div className="font-display text-display-sm mb-3.5 md:mb-4">
        It starts with you. It scales to everyone.
      </div>
      <p className="text-body-xs md:text-body-md text-theme-light max-w-[600px] mx-auto">
        Three layers of intelligence — personal, team, network. Each one makes
        the others smarter.
      </p>
    </Section>
  );
};
