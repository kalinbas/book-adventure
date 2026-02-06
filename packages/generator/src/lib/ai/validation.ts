/**
 * Step 6: Game Data Validation
 *
 * Validates a complete GameData object and reports issues.
 * Read-only — does not modify game data.
 */

import type { GameData } from './game-data-generator';
import type { StoryGraph } from './graph/scene-generator';
import { INTERACTION_TYPES, CONDITION_TYPES, EFFECT_TYPES } from './engine-reference';

export interface ValidationReport {
  errors: string[];
  warnings: string[];
  stats: {
    totalNodes: number;
    totalInteractions: number;
    avgInteractionsPerNode: number;
    endingNodes: number;
    choiceNodes: number;
    interactionTypeCounts: Record<string, number>;
    conditionTypeCounts: Record<string, number>;
    effectTypeCounts: Record<string, number>;
    missingInteractionTypes: string[];
    missingConditionTypes: string[];
    missingEffectTypes: string[];
  };
}

/**
 * Validate game data (read-only — no mutations).
 * Returns a validation report with errors and warnings.
 */
export function validate(gameData: GameData, graph?: StoryGraph): ValidationReport {
  const report: ValidationReport = {
    errors: [],
    warnings: [],
    stats: {
      totalNodes: 0,
      totalInteractions: 0,
      avgInteractionsPerNode: 0,
      endingNodes: 0,
      choiceNodes: 0,
      interactionTypeCounts: {},
      conditionTypeCounts: {},
      effectTypeCounts: {},
      missingInteractionTypes: [],
      missingConditionTypes: [],
      missingEffectTypes: [],
    },
  };

  const nodes = gameData.nodes;
  const nodeIds = new Set(Object.keys(nodes));
  const locationIds = new Set(Object.keys(gameData.locations));
  const characterIds = new Set(Object.keys(gameData.characters));
  const itemIds = new Set(Object.keys(gameData.items));
  const objectIds = new Set(Object.keys(gameData.objects));
  const variableIds = new Set(Object.keys(gameData.variableDefinitions ?? {}));

  // --- Check 1: startNodeId exists ---
  if (!nodeIds.has(gameData.initialState.startNodeId)) {
    report.errors.push(`startNodeId "${gameData.initialState.startNodeId}" does not exist`);
  }

  // --- Check 2: startLocationId exists ---
  if (!locationIds.has(gameData.initialState.startLocationId)) {
    report.errors.push(`startLocationId "${gameData.initialState.startLocationId}" does not exist`);
  }

  // --- Check 3: At least 1 ending node ---
  const endingNodeIds: string[] = [];
  for (const [id, node] of Object.entries(nodes)) {
    if (node.type === 'ending') endingNodeIds.push(id);
  }
  if (endingNodeIds.length === 0) {
    report.warnings.push('No ending nodes found');
  }

  // --- Iterate all nodes and interactions ---
  const interactionTypeCounts: Record<string, number> = {};
  const conditionTypeCounts: Record<string, number> = {};
  const effectTypeCounts: Record<string, number> = {};
  let totalInteractions = 0;
  let nonEndingNodes = 0;

  for (const [nodeId, node] of Object.entries(nodes)) {
    // Check locationId
    if (node.locationId && !locationIds.has(node.locationId)) {
      report.warnings.push(`Node "${nodeId}": locationId "${node.locationId}" not found`);
    }

    // Check presentCharacters
    for (const charId of node.presentCharacters ?? []) {
      if (!characterIds.has(charId)) {
        report.warnings.push(`Node "${nodeId}": character "${charId}" not found`);
      }
    }

    // Check availableObjects
    for (const objId of node.availableObjects ?? []) {
      if (!objectIds.has(objId)) {
        report.warnings.push(`Node "${nodeId}": object "${objId}" not found`);
      }
    }

    // Check node type
    if (node.type === 'ending') {
      report.stats.endingNodes++;
    } else {
      nonEndingNodes++;
      if (node.type === 'choice') report.stats.choiceNodes++;
    }

    // Check interactions
    const seenInteractionIds = new Set<string>();
    for (const interaction of node.interactions ?? []) {
      totalInteractions++;

      // Check for duplicate interaction IDs
      if (seenInteractionIds.has(interaction.id)) {
        report.warnings.push(`Node "${nodeId}": duplicate interaction ID "${interaction.id}"`);
      }
      seenInteractionIds.add(interaction.id);

      // Count interaction type
      interactionTypeCounts[interaction.type] = (interactionTypeCounts[interaction.type] ?? 0) + 1;

      // Check targetNodeId
      if (interaction.targetNodeId && !nodeIds.has(interaction.targetNodeId)) {
        report.errors.push(`Node "${nodeId}": dangling targetNodeId "${interaction.targetNodeId}"`);
      }

      // Check undefined conditions/effects
      if (!Array.isArray(interaction.conditions)) {
        report.warnings.push(`Node "${nodeId}", interaction "${interaction.id}": conditions is not an array`);
      }
      if (!Array.isArray(interaction.effects)) {
        report.warnings.push(`Node "${nodeId}", interaction "${interaction.id}": effects is not an array`);
      }

      // Check conditions
      for (const cond of interaction.conditions ?? []) {
        conditionTypeCounts[cond.type] = (conditionTypeCounts[cond.type] ?? 0) + 1;

        // Validate references
        if ((cond.type === 'has_item' || cond.type === 'lacks_item') && !itemIds.has(cond.key)) {
          report.warnings.push(`Node "${nodeId}", interaction "${interaction.id}": item "${cond.key}" in condition not found`);
        }
        if ((cond.type === 'object_state' || cond.type === 'object_state_not') && !objectIds.has(cond.key)) {
          report.warnings.push(`Node "${nodeId}", interaction "${interaction.id}": object "${cond.key}" in condition not found`);
        }
        if (cond.type === 'visited_node' || cond.type === 'not_visited_node') {
          if (!nodeIds.has(cond.key)) {
            report.warnings.push(`Node "${nodeId}", interaction "${interaction.id}": node "${cond.key}" in visited_node condition not found`);
          }
        }
        if (cond.type === 'visited_location' || cond.type === 'in_location') {
          if (!locationIds.has(cond.key)) {
            report.warnings.push(`Node "${nodeId}", interaction "${interaction.id}": location "${cond.key}" in condition not found`);
          }
        }
        if ((cond.type === 'relation_gte' || cond.type === 'relation_lte') && !characterIds.has(cond.key)) {
          report.warnings.push(`Node "${nodeId}", interaction "${interaction.id}": character "${cond.key}" in relation condition not found`);
        }
        if (cond.type.startsWith('variable_') && !variableIds.has(cond.key)) {
          report.warnings.push(`Node "${nodeId}", interaction "${interaction.id}": variable "${cond.key}" in condition not defined`);
        }
      }

      // Check effects
      for (const effect of interaction.effects ?? []) {
        effectTypeCounts[effect.type] = (effectTypeCounts[effect.type] ?? 0) + 1;

        if ((effect.type === 'add_item' || effect.type === 'remove_item') && !itemIds.has(effect.key)) {
          report.warnings.push(`Node "${nodeId}", interaction "${interaction.id}": item "${effect.key}" in effect not found`);
        }
        if (effect.type === 'set_object_state' && !objectIds.has(effect.key)) {
          report.warnings.push(`Node "${nodeId}", interaction "${interaction.id}": object "${effect.key}" in set_object_state not found`);
        }
        if (effect.type === 'go_to_node' && !nodeIds.has(effect.key)) {
          report.warnings.push(`Node "${nodeId}", interaction "${interaction.id}": node "${effect.key}" in go_to_node not found`);
        }
        if (effect.type === 'set_location' && !locationIds.has(effect.key)) {
          report.warnings.push(`Node "${nodeId}", interaction "${interaction.id}": location "${effect.key}" in set_location not found`);
        }
        if ((effect.type === 'change_relation') && !characterIds.has(effect.key)) {
          report.warnings.push(`Node "${nodeId}", interaction "${interaction.id}": character "${effect.key}" in change_relation not found`);
        }
      }
    }

    // Check non-ending nodes have interactions
    if (node.type !== 'ending' && (!node.interactions || node.interactions.length === 0)) {
      report.warnings.push(`Node "${nodeId}" (${node.type}): has no interactions`);
    }

    // Check onEnter is an array
    if (node.onEnter && !Array.isArray(node.onEnter)) {
      report.warnings.push(`Node "${nodeId}": onEnter is not an array`);
    }

    // Check onEnter effects
    for (const effect of node.onEnter ?? []) {
      effectTypeCounts[effect.type] = (effectTypeCounts[effect.type] ?? 0) + 1;
    }
  }

  // --- Check: Graph connection coverage ---
  if (graph) {
    checkGraphConnections(gameData, graph, report);
  }

  // --- Check: Orphan nodes (unreachable) ---
  checkOrphanNodes(gameData, report);

  // --- Compute stats ---
  report.stats.totalNodes = nodeIds.size;
  report.stats.totalInteractions = totalInteractions;
  report.stats.avgInteractionsPerNode = nonEndingNodes > 0 ? totalInteractions / nonEndingNodes : 0;
  report.stats.interactionTypeCounts = interactionTypeCounts;
  report.stats.conditionTypeCounts = conditionTypeCounts;
  report.stats.effectTypeCounts = effectTypeCounts;

  // --- Check feature coverage ---
  for (const type of INTERACTION_TYPES) {
    if (!interactionTypeCounts[type]) {
      report.stats.missingInteractionTypes.push(type);
    }
  }
  for (const type of CONDITION_TYPES) {
    if (!conditionTypeCounts[type]) {
      report.stats.missingConditionTypes.push(type);
    }
  }
  for (const type of EFFECT_TYPES) {
    if (!effectTypeCounts[type]) {
      report.stats.missingEffectTypes.push(type);
    }
  }

  // --- Quality checks ---
  if (report.stats.avgInteractionsPerNode < 4.0) {
    report.warnings.push(`Average interactions per node is ${report.stats.avgInteractionsPerNode.toFixed(1)} (target: ≥4.0)`);
  }
  if (totalInteractions < 180) {
    report.warnings.push(`Total interactions is ${totalInteractions} (target: ≥180)`);
  }
  if (report.stats.missingInteractionTypes.length > 0) {
    report.warnings.push(`Missing interaction types: ${report.stats.missingInteractionTypes.join(', ')}`);
  }
  if (report.stats.missingConditionTypes.length > 0) {
    report.warnings.push(`Missing condition types: ${report.stats.missingConditionTypes.join(', ')}`);
  }
  if (report.stats.missingEffectTypes.length > 0) {
    report.warnings.push(`Missing effect types: ${report.stats.missingEffectTypes.join(', ')}`);
  }

  return report;
}

/**
 * Check that every graph connection from step 3 has a corresponding interaction.
 * Reports warnings for missing connections (does not add them).
 */
function checkGraphConnections(gameData: GameData, graph: StoryGraph, report: ValidationReport): void {
  const nodes = gameData.nodes;
  for (const graphNode of graph.nodes) {
    const node = nodes[graphNode.id];
    if (!node) continue;

    // Collect all targetNodeIds from existing interactions
    const existingTargets = new Set(
      (node.interactions ?? [])
        .filter((i) => i.targetNodeId)
        .map((i) => i.targetNodeId)
    );

    for (const targetId of graphNode.connections) {
      if (!nodes[targetId]) continue;
      if (existingTargets.has(targetId)) continue;
      report.warnings.push(`Node "${graphNode.id}": missing interaction for graph connection to "${targetId}"`);
    }

    for (const targetId of graphNode.backConnections) {
      if (!nodes[targetId]) continue;
      if (existingTargets.has(targetId)) continue;
      report.warnings.push(`Node "${graphNode.id}": missing interaction for back connection to "${targetId}"`);
    }
  }
}

/**
 * Detect orphan nodes (no incoming links) and report them.
 */
function checkOrphanNodes(gameData: GameData, report: ValidationReport): void {
  const nodes = gameData.nodes;
  const startNodeId = gameData.initialState.startNodeId;

  // Build set of all nodes that have incoming links
  const hasIncoming = new Set<string>();
  for (const node of Object.values(nodes)) {
    for (const interaction of node.interactions ?? []) {
      if (interaction.targetNodeId && nodes[interaction.targetNodeId]) {
        hasIncoming.add(interaction.targetNodeId);
      }
    }
    for (const effect of node.onEnter ?? []) {
      if (effect.type === 'go_to_node' && nodes[effect.key]) {
        hasIncoming.add(effect.key);
      }
    }
  }

  // Find orphans (exclude start node) and report them
  for (const nodeId of Object.keys(nodes)) {
    if (nodeId !== startNodeId && !hasIncoming.has(nodeId)) {
      report.warnings.push(`Orphan node "${nodeId}" has no incoming links`);
    }
  }
}

/**
 * Print a validation report to the console.
 */
export function printValidationReport(report: ValidationReport): void {
  console.log('\n=== Validation Report ===');
  console.log(`Nodes: ${report.stats.totalNodes} (${report.stats.endingNodes} endings, ${report.stats.choiceNodes} choices)`);
  console.log(`Interactions: ${report.stats.totalInteractions} (avg ${report.stats.avgInteractionsPerNode.toFixed(1)}/node)`);

  console.log('\nInteraction types:');
  for (const type of INTERACTION_TYPES) {
    const count = report.stats.interactionTypeCounts[type] ?? 0;
    const marker = count === 0 ? ' ✗' : '';
    console.log(`  ${type}: ${count}${marker}`);
  }

  console.log('\nCondition types:');
  for (const type of CONDITION_TYPES) {
    const count = report.stats.conditionTypeCounts[type] ?? 0;
    const marker = count === 0 ? ' ✗' : '';
    console.log(`  ${type}: ${count}${marker}`);
  }

  console.log('\nEffect types:');
  for (const type of EFFECT_TYPES) {
    const count = report.stats.effectTypeCounts[type] ?? 0;
    const marker = count === 0 ? ' ✗' : '';
    console.log(`  ${type}: ${count}${marker}`);
  }

  if (report.warnings.length > 0) {
    console.log(`\nWarnings (${report.warnings.length}):`);
    for (const warn of report.warnings) console.log(`  - ${warn}`);
  }

  if (report.errors.length > 0) {
    console.log(`\nErrors (${report.errors.length}):`);
    for (const err of report.errors) console.log(`  ! ${err}`);
  }

  const allTypesUsed =
    report.stats.missingInteractionTypes.length === 0 &&
    report.stats.missingConditionTypes.length === 0 &&
    report.stats.missingEffectTypes.length === 0;

  if (allTypesUsed && report.errors.length === 0) {
    console.log('\nAll engine features used. Game is valid.');
  }
  console.log('========================\n');
}
