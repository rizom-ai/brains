/** A field of the open entry an answer may propose text for. */
export interface ProposalField {
  name: string;
  label: string;
}

/** Text an answer proposes for one field of the open entry. */
export interface Proposal {
  field: string;
  label: string;
  text: string;
}

/** A closed fenced block whose info string is `proposal <field>`. */
const PROPOSAL_BLOCK =
  /```proposal[ \t]+([A-Za-z0-9_-]+)[ \t]*\n([\s\S]*?)\n```/g;

/**
 * An answer's prose and the proposals it makes for the open entry's fields.
 * A block for a field the entry lacks, or one still streaming, stays in the
 * prose as the model wrote it.
 */
export function splitProposals(
  content: string,
  fields: readonly ProposalField[],
): { prose: string; proposals: Proposal[] } {
  const proposals: Proposal[] = [];
  const prose = content.replace(
    PROPOSAL_BLOCK,
    (block, name: string, text: string) => {
      const field = fields.find((candidate) => candidate.name === name);
      if (!field) return block;
      proposals.push({ field: field.name, label: field.label, text });
      return "";
    },
  );
  return {
    prose:
      proposals.length > 0 ? prose.replace(/\n{3,}/g, "\n\n").trim() : content,
    proposals,
  };
}
