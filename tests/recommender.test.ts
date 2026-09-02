import { describe, expect, it } from "vitest";
import { seedState } from "../src/data/seed";
import { getIntentWeights, learnFromComparison, rankGames } from "../src/lib/recommender";

describe("recommendation ranking", () => {
  it("returns only candidates in descending score order", () => {
    const results = rankGames(seedState, "movement-heavy combat with meaningful builds");

    expect(results.length).toBeGreaterThan(3);
    expect(results.every(({ game }) => game.status === "candidate")).toBe(true);
    expect(results.map(({ score }) => score)).toEqual(
      [...results.map(({ score }) => score)].sort((a, b) => b - a),
    );
  });

  it("turns natural-language cravings into temporary weight boosts", () => {
    const base = getIntentWeights(seedState.model, "");
    const movement = getIntentWeights(seedState.model, "fast aerial movement and grappling");
    const story = getIntentWeights(seedState.model, "story with narrative choices");

    expect(movement.movement).toBeGreaterThan(base.movement);
    expect(story.narrativeAgency).toBeGreaterThan(base.narrativeAgency);
    expect(seedState.model.weights.movement).toBe(base.movement);
  });

  it("learns without mutating the previous model", () => {
    const warframe = seedState.games.find((game) => game.id === "warframe")!;
    const factorio = seedState.games.find((game) => game.id === "factorio")!;
    const originalMovement = seedState.model.weights.movement;
    const learned = learnFromComparison(seedState.model, warframe, factorio);

    expect(learned.comparisonsLearned).toBe(1);
    expect(learned.weights.movement).toBeGreaterThan(originalMovement);
    expect(seedState.model.weights.movement).toBe(originalMovement);
  });

  it("explains recommendations with positive signals and model anchors", () => {
    const [result] = rankGames(seedState, "deep systems and movement");

    expect(result.positives.length).toBeGreaterThan(0);
    expect(result.analogues.length).toBeGreaterThan(0);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });
});
