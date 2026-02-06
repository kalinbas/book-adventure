/**
 * Step 5: Game Data Coverage Analysis
 *
 * Analyzes generated game data for coverage of all engine features.
 * Read-only — does not modify game data.
 */

import type { GameData } from './game-data-generator';
import { INTERACTION_TYPES, CONDITION_TYPES, EFFECT_TYPES } from './engine-reference';

export interface CoverageReport {
  interactionTypes: Record<string, number>;
  conditionTypes: Record<string, number>;
  effectTypes: Record<string, number>;
  missingInteractionTypes: string[];
  missingConditionTypes: string[];
  missingEffectTypes: string[];
  totalInteractions: number;
  avgInteractionsPerNode: number;
  nodesWithFewInteractions: string[];
}

/**
 * Analyze game data coverage (read-only — no mutations).
 */
export function analyzeGameData(gameData: GameData): CoverageReport {
  const report: CoverageReport = {
    interactionTypes: {},
    conditionTypes: {},
    effectTypes: {},
    missingInteractionTypes: [],
    missingConditionTypes: [],
    missingEffectTypes: [],
    totalInteractions: 0,
    avgInteractionsPerNode: 0,
    nodesWithFewInteractions: [],
  };

  analyzeCoverage(gameData, report);
  return report;
}

/**
 * Analyze coverage of all feature types.
 */
function analyzeCoverage(gameData: GameData, report: CoverageReport): void {
  const interactionCounts: Record<string, number> = {};
  const conditionCounts: Record<string, number> = {};
  const effectCounts: Record<string, number> = {};
  let total = 0;
  let nonEndingNodes = 0;

  for (const [, node] of Object.entries(gameData.nodes)) {
    if (node.type !== 'ending') nonEndingNodes++;

    for (const interaction of node.interactions ?? []) {
      total++;
      interactionCounts[interaction.type] = (interactionCounts[interaction.type] ?? 0) + 1;

      for (const cond of interaction.conditions ?? []) {
        conditionCounts[cond.type] = (conditionCounts[cond.type] ?? 0) + 1;
      }
      for (const effect of interaction.effects ?? []) {
        effectCounts[effect.type] = (effectCounts[effect.type] ?? 0) + 1;
      }
    }

    // Also count onEnter effects
    for (const effect of node.onEnter ?? []) {
      effectCounts[effect.type] = (effectCounts[effect.type] ?? 0) + 1;
    }
  }

  report.interactionTypes = interactionCounts;
  report.conditionTypes = conditionCounts;
  report.effectTypes = effectCounts;
  report.totalInteractions = total;
  report.avgInteractionsPerNode = nonEndingNodes > 0 ? total / nonEndingNodes : 0;

  report.missingInteractionTypes = INTERACTION_TYPES.filter((t) => !interactionCounts[t]);
  report.missingConditionTypes = CONDITION_TYPES.filter((t) => !conditionCounts[t]);
  report.missingEffectTypes = EFFECT_TYPES.filter((t) => !effectCounts[t]);

  // Find nodes with few interactions
  report.nodesWithFewInteractions = [];
  for (const [nodeId, node] of Object.entries(gameData.nodes)) {
    if (node.type !== 'ending' && (node.interactions?.length ?? 0) < 5) {
      report.nodesWithFewInteractions.push(nodeId);
    }
  }
}

/**
 * Print coverage report to console.
 */
export function printCoverageReport(report: CoverageReport): void {
  console.log('\n=== Coverage Report ===');
  console.log(`Total interactions: ${report.totalInteractions} (avg ${report.avgInteractionsPerNode.toFixed(1)}/node)`);

  if (report.nodesWithFewInteractions.length > 0) {
    console.log(`Nodes with <5 interactions: ${report.nodesWithFewInteractions.length}`);
  }

  if (report.missingInteractionTypes.length > 0) {
    console.log(`Missing interaction types: ${report.missingInteractionTypes.join(', ')}`);
  }
  if (report.missingConditionTypes.length > 0) {
    console.log(`Missing condition types: ${report.missingConditionTypes.join(', ')}`);
  }
  if (report.missingEffectTypes.length > 0) {
    console.log(`Missing effect types: ${report.missingEffectTypes.join(', ')}`);
  }
  console.log('========================\n');
}
