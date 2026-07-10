export interface OwnershipCard {
  badge: string;
  title: string;
  body: string;
}

export interface OwnershipContent {
  kicker: string;
  headline: string;
  cards: OwnershipCard[];
}
