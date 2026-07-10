export interface ProofTestimonial {
  quote: string;
  attribution: string;
}

export interface ProofContent {
  kicker: string;
  headline: string;
  testimonials?: ProofTestimonial[];
  quote?: string;
  attribution?: string;
  partnersLabel?: string;
  partners?: string[];
}
