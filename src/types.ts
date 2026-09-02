export const FEATURE_KEYS = [
  "movement",
  "execution",
  "buildDiversity",
  "playstyleChange",
  "challengeRetention",
  "systemsDepth",
  "discovery",
  "socialFlexibility",
  "characterAuthorship",
  "narrativeAgency",
  "powerFantasy",
  "prescriptiveness",
  "automationCollapse",
  "grindFriction",
] as const;

export type FeatureKey = (typeof FEATURE_KEYS)[number];
export type FeatureVector = Record<FeatureKey, number>;

export type GameStatus =
  | "love"
  | "like"
  | "mixed"
  | "fell_off"
  | "bounced"
  | "dislike"
  | "candidate";

export interface Evidence {
  label: string;
  url: string;
}

export interface Game {
  id: string;
  title: string;
  status: GameStatus;
  features: FeatureVector;
  confidence: number;
  notes: string;
  strengths: string[];
  concerns: string[];
  traits: string[];
  evidence?: Evidence[];
}

export interface PreferenceModel {
  weights: FeatureVector;
  comparisonsLearned: number;
}

export interface Comparison {
  id: string;
  leftId: string;
  rightId: string;
  winnerId: string;
  createdAt: string;
}

export interface AppState {
  version: 1;
  games: Game[];
  model: PreferenceModel;
  comparisons: Comparison[];
}

export interface ScoreReason {
  key: FeatureKey;
  label: string;
  value: number;
}

export interface Recommendation {
  game: Game;
  score: number;
  positives: ScoreReason[];
  risks: string[];
  analogues: string[];
  uncertainty?: string;
}
