/**
 * Step 6: Game Data Validation
 *
 * Validates a complete GameData object and auto-fixes common issues.
 * Pure TypeScript — no API calls needed.
 */

import type { GameData } from './game-data-generator';
import { INTERACTION_TYPES, CONDITION_TYPES, EFFECT_TYPES } from './engine-reference';

export interface ValidationReport {
  errors: string[];
  warnings: string[];
  fixes: string[];
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
 * Validate game data and apply fixes for common issues.
 * Returns the (possibly modified) game data and a validation report.
 */
export function validateAndFix(gameData: GameData): { gameData: GameData; report: ValidationReport } {
  const report: ValidationReport = {
    errors: [],
    warnings: [],
    fixes: [],
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

  // Find ending nodes
  const endingNodeIds: string[] = [];
  for (const [id, node] of Object.entries(nodes)) {
    if (node.type === 'ending') endingNodeIds.push(id);
  }

  // --- Check 1: startNodeId exists ---
  if (!nodeIds.has(gameData.initialState.startNodeId)) {
    report.errors.push(`startNodeId "${gameData.initialState.startNodeId}" does not exist`);
  }

  // --- Check 2: startLocationId exists ---
  if (!locationIds.has(gameData.initialState.startLocationId)) {
    report.errors.push(`startLocationId "${gameData.initialState.startLocationId}" does not exist`);
  }

  // --- Check 3: At least 1 ending node ---
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

      // Unique interaction ID
      if (seenInteractionIds.has(interaction.id)) {
        const newId = `${interaction.id}_${totalInteractions}`;
        report.fixes.push(`Node "${nodeId}": duplicate interaction ID "${interaction.id}" → "${newId}"`);
        interaction.id = newId;
      }
      seenInteractionIds.add(interaction.id);

      // Count interaction type
      interactionTypeCounts[interaction.type] = (interactionTypeCounts[interaction.type] ?? 0) + 1;

      // Check targetNodeId
      if (interaction.targetNodeId && !nodeIds.has(interaction.targetNodeId)) {
        if (endingNodeIds.length > 0) {
          const fallback = endingNodeIds[0];
          report.fixes.push(`Node "${nodeId}": dangling targetNodeId "${interaction.targetNodeId}" → "${fallback}"`);
          interaction.targetNodeId = fallback;
        } else {
          report.warnings.push(`Node "${nodeId}": dangling targetNodeId "${interaction.targetNodeId}"`);
        }
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
          // Variables can also be flags/custom — only warn for variable_ conditions
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

    // Check onEnter effects
    for (const effect of node.onEnter ?? []) {
      effectTypeCounts[effect.type] = (effectTypeCounts[effect.type] ?? 0) + 1;
    }
  }

  // --- Check: Orphan nodes (unreachable) ---
  reconnectOrphanNodes(gameData, report);

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

  return { gameData, report };
}

/**
 * Detect orphan nodes (no incoming links) and reconnect them.
 *
 * Strategy: for each orphan, find the best predecessor by matching
 * chapter number and location. Insert a "go" interaction from the
 * predecessor to the orphan so the player can actually reach it.
 */
function reconnectOrphanNodes(gameData: GameData, report: ValidationReport): void {
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

  // Find orphans (exclude start node)
  const orphans: string[] = [];
  for (const nodeId of Object.keys(nodes)) {
    if (nodeId !== startNodeId && !hasIncoming.has(nodeId)) {
      orphans.push(nodeId);
    }
  }

  if (orphans.length === 0) return;

  report.warnings.push(`Found ${orphans.length} orphan node(s) with no incoming links`);

  // Build a list of all non-ending nodes as potential predecessors
  const nodeEntries = Object.entries(nodes).filter(([, n]) => n.type !== 'ending');

  for (const orphanId of orphans) {
    const orphan = nodes[orphanId];
    if (!orphan) continue;

    // Find best predecessor: same chapter + same location > same chapter > same location > any
    let bestPredecessor: string | null = null;
    let bestScore = -1;

    for (const [candidateId, candidate] of nodeEntries) {
      if (candidateId === orphanId) continue;

      // Don't add a link from a node that already links to orphan's targets
      // (would create a bypass). Prefer nodes that don't already have too many go interactions.
      const goCount = (candidate.interactions ?? []).filter((i) => i.type === 'go').length;
      if (goCount >= 6) continue;

      let score = 0;
      if (candidate.chapterNumber === orphan.chapterNumber) score += 10;
      if (candidate.locationId === orphan.locationId) score += 5;

      // Prefer nodes that connect to nodes the orphan also connects to (siblings)
      const candidateTargets = new Set(
        (candidate.interactions ?? [])
          .filter((i) => i.targetNodeId)
          .map((i) => i.targetNodeId)
      );
      const orphanTargets = new Set(
        (orphan.interactions ?? [])
          .filter((i) => i.targetNodeId)
          .map((i) => i.targetNodeId)
      );
      for (const t of orphanTargets) {
        if (candidateTargets.has(t)) score += 3;
      }

      // Prefer nodes that are already reachable (have incoming links or are start)
      if (candidateId === startNodeId || hasIncoming.has(candidateId)) score += 2;

      if (score > bestScore) {
        bestScore = score;
        bestPredecessor = candidateId;
      }
    }

    if (!bestPredecessor) continue;

    const predecessor = nodes[bestPredecessor];
    const orphanLocation = gameData.locations[orphan.locationId];
    const orphanName = orphanLocation?.name ?? orphan.title;

    if (!predecessor.interactions) predecessor.interactions = [];
    predecessor.interactions.push({
      id: `fix_orphan_go_${orphanId}`,
      type: 'go',
      buttonText: `Go to ${orphanName}`,
      resultText: `You make your way to ${orphanName.toLowerCase()}.`,
      conditions: [],
      effects: [{ type: 'set_location', key: orphan.locationId }],
      targetNodeId: orphanId,
    } as any);

    hasIncoming.add(orphanId);
    report.fixes.push(`Orphan "${orphanId}": added link from "${bestPredecessor}"`);
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

  if (report.fixes.length > 0) {
    console.log(`\nFixes applied (${report.fixes.length}):`);
    for (const fix of report.fixes) console.log(`  - ${fix}`);
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
