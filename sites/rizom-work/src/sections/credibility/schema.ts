export interface CredibilityCard {
  title: string;
  body: string;
}

export interface CredibilityContent {
  kicker: string;
  headline: string;
  cards: CredibilityCard[];
}
