export interface FeatureRow {
  icon: string;
  title: string;
  body: string;
}

export interface OwnershipContent {
  badge: string;
  headline: string;
  features: FeatureRow[];
}
