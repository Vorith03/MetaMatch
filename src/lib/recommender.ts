import {
  FEATURE_KEYS,
  type AppState,
  type FeatureKey,
  type FeatureVector,
  type Game,
  type PreferenceModel,
  type Recommendation,
  type ScoreReason,
} from "../types";

export const FEATURE_META: Record<FeatureKey, { label: string; short: string; negative?: boolean }> = {
  movement: { label: "Movement depth", short: "movement" },
  execution: { label: "Mechanical execution", short: "execution" },
  buildDiversity: { label: "Build diversity", short: "build variety" },
  playstyleChange: { label: "Playstyle-changing choices", short: "mechanical authorship" },
  challengeRetention: { label: "Challenge retention", short: "lasting challenge" },
  systemsDepth: { label: "Systems depth", short: "systems depth" },
  discovery: { label: "Discovery runway", short: "discovery" },
  socialFlexibility: { label: "Social flexibility", short: "flexible co-op" },
  characterAuthorship: { label: "Character authorship", short: "character authorship" },
  narrativeAgency: { label: "Narrative agency", short: "narrative choice" },
  powerFantasy: { label: "Power fantasy", short: "power fantasy" },
  prescriptiveness: { label: "Prescriptiveness", short: "prescribed play", negative: true },
  automationCollapse: { label: "Automation collapse", short: "self-playing builds", negative: true },
  grindFriction: { label: "Grind friction", short: "grind", negative: true },
};

const intentRules: Array<{ terms: RegExp; boosts: Partial<FeatureVector> }> = [
  {
    terms: /movement|mobile|mobility|fast|dash|parkour|grappl|aerial|momentum/i,
    boosts: { movement: 1.65, execution: 0.45, challengeRetention: 0.2 },
  },
  {
    terms: /build|theorycraft|custom|synerg|loadout|mechanical choice/i,
    boosts: { buildDiversity: 1.25, playstyleChange: 1.45, characterAuthorship: 0.75 },
  },
  {
    terms: /hard|challenge|demanding|skill|execution|master/i,
    boosts: { execution: 1.25, challengeRetention: 1.35, automationCollapse: 0.55 },
  },
  {
    terms: /co-op|coop|friend|partner|together|social/i,
    boosts: { socialFlexibility: 2.1 },
  },
  {
    terms: /system|discover|experiment|weird|deep|complex/i,
    boosts: { systemsDepth: 1.2, discovery: 1.15, characterAuthorship: 0.4 },
  },
  {
    terms: /persistent|long.term|my character|identity/i,
    boosts: { characterAuthorship: 1.7, systemsDepth: 0.5 },
  },
  {
    terms: /story|narrative|choice|character/i,
    boosts: { narrativeAgency: 1.9, discovery: 0.25 },
  },
  {
    terms: /power|overpowered|ridiculous|scale/i,
    boosts: { powerFantasy: 1.45 },
  },
];

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

export function getIntentWeights(model: PreferenceModel, intent: string): FeatureVector {
  const weights = { ...model.weights };

  for (const rule of intentRules) {
    if (!rule.terms.test(intent)) continue;
    for (const [key, boost] of Object.entries(rule.boosts)) {
      const feature = key as FeatureKey;
      weights[feature] = clamp(weights[feature] + (boost ?? 0), 0.1, 4);
    }
  }

  if (/chill|relax|easy|low.stress/i.test(intent)) {
    weights.execution = Math.max(0.25, weights.execution * 0.45);
    weights.challengeRetention = Math.max(0.25, weights.challengeRetention * 0.45);
  }

  return weights;
}

function satisfaction(game: Game, key: FeatureKey): number {
  const value = game.features[key];
  return FEATURE_META[key].negative ? 10 - value : value;
}

function weightedFit(game: Game, weights: FeatureVector): number {
  let weightedTotal = 0;
  let weightTotal = 0;

  for (const key of FEATURE_KEYS) {
    weightedTotal += satisfaction(game, key) * weights[key];
    weightTotal += weights[key];
  }

  const base = (weightedTotal / weightTotal) * 10;
  const movementExecution = (game.features.movement * game.features.execution) / 100;
  const authoredChallenge =
    (game.features.playstyleChange * game.features.challengeRetention) / 100;
  const systemicDiscovery = (game.features.systemsDepth * game.features.discovery) / 100;
  const synergy =
    (movementExecution - 0.25) * 5 +
    (authoredChallenge - 0.25) * 8 +
    (systemicDiscovery - 0.25) * 4;

  const raw = clamp(base + synergy, 0, 100);
  const confidenceStrength = 0.55 + game.confidence * 0.45;
  return clamp(50 + (raw - 50) * confidenceStrength, 0, 100);
}

function topReasons(game: Game, weights: FeatureVector): ScoreReason[] {
  return FEATURE_KEYS.map((key) => ({
    key,
    label: FEATURE_META[key].label,
    value: satisfaction(game, key) * weights[key],
  }))
    .filter((reason) => reason.value > 6)
    .sort((a, b) => b.value - a.value)
    .slice(0, 3);
}

function risksFor(game: Game, weights: FeatureVector): string[] {
  const risks: Array<{ text: string; severity: number }> = [];

  if (game.features.automationCollapse >= 6) {
    risks.push({
      text: "Strong builds may eventually reduce how much execution matters.",
      severity: game.features.automationCollapse * weights.automationCollapse,
    });
  }
  if (game.features.prescriptiveness >= 6) {
    risks.push({
      text: "Its viable choices may converge toward prescribed answers.",
      severity: game.features.prescriptiveness * weights.prescriptiveness,
    });
  }
  if (game.features.grindFriction >= 7) {
    risks.push({
      text: "Meaningful progress may demand more grind than the mechanics justify.",
      severity: game.features.grindFriction * weights.grindFriction,
    });
  }

  const valuedWeaknesses = FEATURE_KEYS.filter(
    (key) =>
      !FEATURE_META[key].negative &&
      weights[key] >= 1.4 &&
      game.features[key] <= 4,
  )
    .map((key) => ({
      text: `${FEATURE_META[key].label} looks comparatively weak.`,
      severity: (10 - game.features[key]) * weights[key],
    }));

  return [...risks, ...valuedWeaknesses]
    .sort((a, b) => b.severity - a.severity)
    .slice(0, 2)
    .map((risk) => risk.text);
}

function similarity(a: Game, b: Game, weights: FeatureVector): number {
  let squaredDistance = 0;
  let weightTotal = 0;
  for (const key of FEATURE_KEYS) {
    const delta = satisfaction(a, key) - satisfaction(b, key);
    squaredDistance += weights[key] * delta * delta;
    weightTotal += weights[key];
  }
  return 1 - Math.sqrt(squaredDistance / weightTotal) / 10;
}

function analoguesFor(game: Game, games: Game[], weights: FeatureVector): string[] {
  return games
    .filter((item) => item.status === "love" || item.status === "like" || item.status === "fell_off")
    .map((item) => ({ item, score: similarity(game, item, weights) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 2)
    .map(({ item }) => item.title);
}

export function rankGames(state: AppState, intent: string): Recommendation[] {
  const weights = getIntentWeights(state.model, intent);
  return state.games
    .filter((game) => game.status === "candidate")
    .map((game) => ({
      game,
      score: Math.round(weightedFit(game, weights)),
      positives: topReasons(game, weights),
      risks: risksFor(game, weights),
      analogues: analoguesFor(game, state.games, weights),
      uncertainty:
        game.confidence < 0.68
          ? "Evidence is still thin; treat this as an interesting lead, not a verdict."
          : game.confidence < 0.78
            ? "Some feature ratings are provisional and should be corrected after play."
            : undefined,
    }))
    .sort((a, b) => b.score - a.score || a.game.title.localeCompare(b.game.title));
}

export function learnFromComparison(
  model: PreferenceModel,
  winner: Game,
  loser: Game,
): PreferenceModel {
  const next = { ...model.weights };
  const learningRate = 0.055;

  for (const key of FEATURE_KEYS) {
    const difference = (satisfaction(winner, key) - satisfaction(loser, key)) / 10;
    next[key] = clamp(next[key] + difference * learningRate, 0.1, 4);
  }

  return {
    weights: next,
    comparisonsLearned: model.comparisonsLearned + 1,
  };
}

export function featureLabel(key: FeatureKey): string {
  return FEATURE_META[key].label;
}
