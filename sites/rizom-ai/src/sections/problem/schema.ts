export interface ProblemCard {
  num: string;
  title: string;
  body: string;
}

export interface ProblemContent {
  cards: [ProblemCard, ProblemCard, ProblemCard];
}
