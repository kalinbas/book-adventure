/**
 * Step 5: Game Data Enrichment
 *
 * Analyzes generated game data for coverage gaps and fills them:
 * - 5a: Coverage analysis
 * - 5b: Navigation loop injection
 * - 5c: Missing pattern injection
 * - 5d: Minimum interaction count padding
 *
 * Mostly TypeScript — no API calls needed for the core enrichment.
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
  nodesWithNoBacktrack: string[];
  loopsAdded: number;
  patternsInjected: number;
  interactionsPadded: number;
}

interface Interaction {
  id: string;
  type: string;
  buttonText: string;
  resultText: string;
  targetObject?: string;
  requiresItem?: string;
  conditions: { type: string; key: string; value?: string | number | boolean }[];
  effects: { type: string; key: string; value?: string | number | boolean; delta?: number }[];
  targetNodeId?: string;
}

/**
 * Run all enrichment steps on game data.
 */
export function enrichGameData(gameData: GameData): { gameData: GameData; report: CoverageReport } {
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
    nodesWithNoBacktrack: [],
    loopsAdded: 0,
    patternsInjected: 0,
    interactionsPadded: 0,
  };

  // 5a: Analyze current coverage
  analyzeCoverage(gameData, report);

  // 5b: Add navigation loops
  injectNavigationLoops(gameData, report);

  // 5c: Inject missing patterns
  injectMissingPatterns(gameData, report);

  // 5d: Pad nodes with too few interactions
  padMinimumInteractions(gameData, report);

  // Re-analyze after enrichment
  analyzeCoverage(gameData, report);

  return { gameData, report };
}

/**
 * 5a: Analyze coverage of all feature types
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
    if (node.type !== 'ending' && (node.interactions?.length ?? 0) < 4) {
      report.nodesWithFewInteractions.push(nodeId);
    }
  }
}

/**
 * 5b: Inject navigation loops — add "go back" interactions to hub nodes.
 *
 * Only adds backtrack links to nodes that are reachable from a hub,
 * so the player doesn't get nonsensical "Return to X" options for
 * places they haven't been or that are far away in the story.
 */
function injectNavigationLoops(gameData: GameData, report: CoverageReport): void {
  const nodes = gameData.nodes;
  const nodeIds = Object.keys(nodes);

  // Build adjacency map: nodeId → set of directly connected node IDs (forward links)
  const forwardLinks: Record<string, Set<string>> = {};
  for (const [nodeId, node] of Object.entries(nodes)) {
    forwardLinks[nodeId] = new Set();
    for (const interaction of node.interactions ?? []) {
      if (interaction.targetNodeId) {
        forwardLinks[nodeId].add(interaction.targetNodeId);
      }
    }
  }

  // Build reverse adjacency: nodeId → set of nodes that link TO this node
  const reverseLinks: Record<string, Set<string>> = {};
  for (const [nodeId, node] of Object.entries(nodes)) {
    for (const interaction of node.interactions ?? []) {
      if (interaction.targetNodeId) {
        if (!reverseLinks[interaction.targetNodeId]) reverseLinks[interaction.targetNodeId] = new Set();
        reverseLinks[interaction.targetNodeId].add(nodeId);
      }
    }
  }

  // Find hub nodes (targeted by 3+ other nodes, or checkpoints) — exclude endings
  const incomingCounts: Record<string, number> = {};
  for (const [nodeId, sources] of Object.entries(reverseLinks)) {
    incomingCounts[nodeId] = sources.size;
  }

  const hubNodes = nodeIds.filter(
    (id) => nodes[id].type !== 'ending' && ((incomingCounts[id] ?? 0) >= 3 || nodes[id].type === 'checkpoint')
  );
  if (hubNodes.length === 0 && nodeIds.length > 0) {
    hubNodes.push(gameData.initialState.startNodeId);
  }

  // For each hub, compute reachable set (BFS forward, max 15 hops) to limit backtrack scope
  const hubReachable: Record<string, Set<string>> = {};
  for (const hub of hubNodes) {
    const reachable = new Set<string>();
    const queue = [hub];
    const visited = new Set<string>([hub]);
    const depths = new Map<string, number>([[hub, 0]]);

    while (queue.length > 0) {
      const current = queue.shift()!;
      const depth = depths.get(current) ?? 0;
      if (depth >= 15) continue;

      reachable.add(current);
      for (const next of forwardLinks[current] ?? []) {
        if (!visited.has(next)) {
          visited.add(next);
          depths.set(next, depth + 1);
          queue.push(next);
        }
      }
    }
    hubReachable[hub] = reachable;
  }

  let loopsAdded = 0;

  for (const [nodeId, node] of Object.entries(nodes)) {
    if (node.type === 'ending') continue;

    // Check if this node already has a backward "go" interaction to a hub
    const hasBacktrack = (node.interactions ?? []).some(
      (i) => i.type === 'go' && i.targetNodeId && hubNodes.includes(i.targetNodeId)
    );
    if (hasBacktrack) continue;

    // Find hubs that can reach this node (meaning player could have come from there)
    const reachableHubs = hubNodes.filter((h) => h !== nodeId && hubReachable[h]?.has(nodeId));
    if (reachableHubs.length === 0) continue;

    // Prefer same location, then any reachable hub
    const nearestHub = reachableHubs.find((h) => nodes[h]?.locationId === node.locationId)
      ?? reachableHubs[0];

    const hubNode = nodes[nearestHub];
    const hubLocation = gameData.locations[hubNode.locationId];
    const hubName = hubLocation?.name ?? hubNode.title;

    const backtrackInteraction: Interaction = {
      id: `go_back_${nearestHub}_from_${nodeId}`,
      type: 'go',
      buttonText: `Return to ${hubName}`,
      resultText: `You make your way back to ${hubName.toLowerCase()}.`,
      conditions: [],
      effects: [{ type: 'set_location', key: hubNode.locationId }],
      targetNodeId: nearestHub,
    };

    if (!node.interactions) node.interactions = [];
    node.interactions.push(backtrackInteraction as any);
    loopsAdded++;
  }

  report.loopsAdded = loopsAdded;
}

/**
 * 5c: Inject missing patterns — add interactions that use missing feature types
 */
function injectMissingPatterns(gameData: GameData, report: CoverageReport): void {
  let patternsInjected = 0;
  const nodes = gameData.nodes;
  const nodeEntries = Object.entries(nodes).filter(([, n]) => n.type !== 'ending');
  if (nodeEntries.length === 0) return;

  const items = Object.values(gameData.items);
  const characters = Object.values(gameData.characters);
  const objects = Object.values(gameData.objects);
  const locations = Object.values(gameData.locations);
  const variables = Object.keys(gameData.variableDefinitions ?? {});

  // Helper: get a suitable node to inject into (prefers nodes with characters/items present)
  function findNodeForInjection(prefer?: {
    hasCharacter?: boolean;
    hasObject?: boolean;
    hasItem?: boolean;
    minIndex?: number;
  }): [string, any] | null {
    const start = prefer?.minIndex ?? 0;
    for (let i = start; i < nodeEntries.length; i++) {
      const [id, node] = nodeEntries[i];
      if (prefer?.hasCharacter && (!node.presentCharacters || node.presentCharacters.length === 0)) continue;
      if (prefer?.hasObject && (!node.availableObjects || node.availableObjects.length === 0)) continue;
      return [id, node];
    }
    // Fallback: return any non-ending node
    return nodeEntries[Math.min(start, nodeEntries.length - 1)] ?? null;
  }

  // --- Missing interaction types ---

  if (report.missingInteractionTypes.includes('use_on') && items.length > 0 && objects.length > 0) {
    const entry = findNodeForInjection({ hasObject: true });
    if (entry) {
      const [, node] = entry;
      const item = items[0];
      const obj = objects[0];
      const newState = obj.states?.[1] ?? 'modified';
      addInteraction(node, {
        id: `enrich_use_on_${item.id}_${obj.id}`,
        type: 'use_on',
        buttonText: `Use ${item.name} on ${obj.name}`,
        resultText: `You carefully apply the ${item.name.toLowerCase()} to the ${obj.name.toLowerCase()}. Something changes.`,
        targetObject: obj.id,
        requiresItem: item.id,
        conditions: [{ type: 'has_item', key: item.id }],
        effects: [{ type: 'set_object_state', key: obj.id, value: newState }],
      });
      patternsInjected++;
    }
  }

  if (report.missingInteractionTypes.includes('give') && items.length > 0 && characters.length > 0) {
    const entry = findNodeForInjection({ hasCharacter: true });
    if (entry) {
      const [, node] = entry;
      const item = items[Math.min(1, items.length - 1)];
      const char = characters[0];
      addInteraction(node, {
        id: `enrich_give_${item.id}_to_${char.id}`,
        type: 'give',
        buttonText: `Give ${item.name} to ${char.name}`,
        resultText: `You hand the ${item.name.toLowerCase()} to ${char.name}. They accept it gratefully.`,
        requiresItem: item.id,
        targetObject: char.id,
        conditions: [{ type: 'has_item', key: item.id }],
        effects: [
          { type: 'remove_item', key: item.id },
          { type: 'change_relation', key: char.id, delta: 15 },
          { type: 'set_flag', key: `gave_${item.id}_to_${char.id}`, value: true },
        ],
      });
      patternsInjected++;
    }
  }

  if (report.missingInteractionTypes.includes('ask') && characters.length > 0) {
    const entry = findNodeForInjection({ hasCharacter: true, minIndex: 3 });
    if (entry) {
      const [, node] = entry;
      const char = characters[Math.min(1, characters.length - 1)];
      addInteraction(node, {
        id: `enrich_ask_${char.id}_about_past`,
        type: 'ask',
        buttonText: `Ask ${char.name} about their past`,
        resultText: `${char.name} pauses thoughtfully before sharing a memory from long ago.`,
        targetObject: char.id,
        conditions: [],
        effects: [{ type: 'set_flag', key: `asked_${char.id}_past`, value: true }],
      });
      patternsInjected++;
    }
  }

  // --- Missing condition types ---

  if (report.missingConditionTypes.includes('object_state') && objects.length > 0) {
    const entry = findNodeForInjection({ hasObject: true, minIndex: 2 });
    if (entry) {
      const [, node] = entry;
      const obj = objects[0];
      const state = obj.initialState ?? obj.states?.[0] ?? 'normal';
      addInteraction(node, {
        id: `enrich_examine_${obj.id}_state`,
        type: 'examine',
        buttonText: `Inspect ${obj.name} closely`,
        resultText: `You examine the ${obj.name.toLowerCase()} carefully, noticing its current condition.`,
        targetObject: obj.id,
        conditions: [{ type: 'object_state', key: obj.id, value: state }],
        effects: [{ type: 'set_object_state', key: obj.id, value: obj.states?.[1] ?? 'examined' }],
      });
      patternsInjected++;
    }
  }

  if (report.missingConditionTypes.includes('object_state_not') && objects.length > 0) {
    const entry = findNodeForInjection({ hasObject: true, minIndex: 4 });
    if (entry) {
      const [, node] = entry;
      const obj = objects[Math.min(1, objects.length - 1)];
      addInteraction(node, {
        id: `enrich_examine_${obj.id}_not_state`,
        type: 'examine',
        buttonText: `Study ${obj.name}`,
        resultText: `You study the ${obj.name.toLowerCase()} and discover something new about it.`,
        targetObject: obj.id,
        conditions: [{ type: 'object_state_not', key: obj.id, value: obj.initialState ?? 'normal' }],
        effects: [],
      });
      patternsInjected++;
    }
  }

  if (report.missingConditionTypes.includes('visited_node') && nodeEntries.length > 5) {
    const entry = findNodeForInjection({ minIndex: 5 });
    if (entry) {
      const [, node] = entry;
      const earlierNode = nodeEntries[1][0];
      addInteraction(node, {
        id: `enrich_reflect_visited_${earlierNode}`,
        type: 'examine',
        buttonText: 'Reflect on earlier events',
        resultText: `Your mind drifts back to what happened earlier. The memory gives you new perspective.`,
        conditions: [{ type: 'visited_node', key: earlierNode }],
        effects: [{ type: 'set_flag', key: `reflected_on_${earlierNode}`, value: true }],
      });
      patternsInjected++;
    }
  }

  if (report.missingConditionTypes.includes('not_visited_node') && nodeEntries.length > 5) {
    const entry = findNodeForInjection({ minIndex: 3 });
    if (entry) {
      const [, node] = entry;
      const laterNode = nodeEntries[Math.min(nodeEntries.length - 2, 8)][0];
      addInteraction(node, {
        id: `enrich_wonder_not_visited_${laterNode}`,
        type: 'examine',
        buttonText: 'Consider the path ahead',
        resultText: `You sense there is much yet undiscovered. Perhaps you should explore further.`,
        conditions: [{ type: 'not_visited_node', key: laterNode }],
        effects: [],
      });
      patternsInjected++;
    }
  }

  if (report.missingConditionTypes.includes('visited_location') && locations.length > 1) {
    const entry = findNodeForInjection({ hasCharacter: true, minIndex: 4 });
    if (entry) {
      const [, node] = entry;
      const loc = locations[Math.min(1, locations.length - 1)];
      const char = characters.length > 0 ? characters[0] : null;
      addInteraction(node, {
        id: `enrich_talk_visited_${loc.id}`,
        type: char ? 'talk' : 'examine',
        buttonText: char ? `Tell ${char.name} about ${loc.name}` : `Recall ${loc.name}`,
        resultText: char
          ? `You describe ${loc.name} to ${char.name}, who listens with interest.`
          : `You recall your time at ${loc.name}, the details vivid in your mind.`,
        targetObject: char?.id,
        conditions: [{ type: 'visited_location', key: loc.id }],
        effects: char ? [{ type: 'change_relation', key: char.id, delta: 5 }] : [],
      });
      patternsInjected++;
    }
  }

  if (report.missingConditionTypes.includes('relation_gte') && characters.length > 0) {
    const entry = findNodeForInjection({ hasCharacter: true, minIndex: 6 });
    if (entry) {
      const [, node] = entry;
      const char = characters[0];
      addInteraction(node, {
        id: `enrich_talk_trusted_${char.id}`,
        type: 'talk',
        buttonText: `Confide in ${char.name}`,
        resultText: `${char.name} leans in close. "I trust you too," they say, sharing something deeply personal.`,
        targetObject: char.id,
        conditions: [{ type: 'relation_gte', key: char.id, value: 30 }],
        effects: [{ type: 'set_flag', key: `confided_${char.id}`, value: true }],
      });
      patternsInjected++;
    }
  }

  if (report.missingConditionTypes.includes('relation_lte') && characters.length > 1) {
    const entry = findNodeForInjection({ hasCharacter: true, minIndex: 7 });
    if (entry) {
      const [, node] = entry;
      const char = characters[Math.min(1, characters.length - 1)];
      addInteraction(node, {
        id: `enrich_talk_distrusted_${char.id}`,
        type: 'talk',
        buttonText: `Confront ${char.name}`,
        resultText: `${char.name} glares at you coldly. "We have nothing to discuss," they snap.`,
        targetObject: char.id,
        conditions: [{ type: 'relation_lte', key: char.id, value: -10 }],
        effects: [],
      });
      patternsInjected++;
    }
  }

  if (report.missingConditionTypes.includes('variable_eq') && variables.length > 0) {
    const entry = findNodeForInjection({ minIndex: 8 });
    if (entry) {
      const [, node] = entry;
      addInteraction(node, {
        id: `enrich_check_var_eq_${variables[0]}`,
        type: 'examine',
        buttonText: 'Assess your situation',
        resultText: `You take stock of everything. You are exactly where you started — no better, no worse.`,
        conditions: [{ type: 'variable_eq', key: variables[0], value: 0 }],
        effects: [],
      });
      patternsInjected++;
    }
  }

  if (report.missingConditionTypes.includes('variable_gt') && variables.length > 0) {
    const entry = findNodeForInjection({ minIndex: 6 });
    if (entry) {
      const [, node] = entry;
      addInteraction(node, {
        id: `enrich_check_var_gt_${variables[0]}`,
        type: 'story',
        buttonText: 'Draw on your experience',
        resultText: `Your accumulated knowledge serves you well here. You see the solution clearly.`,
        conditions: [{ type: 'variable_gt', key: variables[0], value: 5 }],
        effects: [{ type: 'change_variable', key: variables[0], delta: 3 }],
      });
      patternsInjected++;
    }
  }

  if (report.missingConditionTypes.includes('variable_lt') && variables.length > 0) {
    const entry = findNodeForInjection({ minIndex: 7 });
    if (entry) {
      const [, node] = entry;
      addInteraction(node, {
        id: `enrich_check_var_lt_${variables[0]}`,
        type: 'story',
        buttonText: 'Struggle with the challenge',
        resultText: `Without sufficient preparation, this proves more difficult than expected.`,
        conditions: [{ type: 'variable_lt', key: variables[0], value: 3 }],
        effects: [],
      });
      patternsInjected++;
    }
  }

  if (report.missingConditionTypes.includes('in_location') && locations.length > 0) {
    const entry = findNodeForInjection({ minIndex: 2 });
    if (entry) {
      const [, node] = entry;
      const loc = locations.find((l) => l.id === node.locationId) ?? locations[0];
      addInteraction(node, {
        id: `enrich_location_specific_${loc.id}`,
        type: 'examine',
        buttonText: `Search this area`,
        resultText: `You search the area carefully. Being here in ${loc.name} gives you a unique vantage point.`,
        conditions: [{ type: 'in_location', key: loc.id }],
        effects: [{ type: 'set_flag', key: `searched_${loc.id}`, value: true }],
      });
      patternsInjected++;
    }
  }

  // --- Missing effect types ---

  if (report.missingEffectTypes.includes('remove_item') && items.length > 0) {
    // Check if there's already a give interaction we can add remove_item to
    let added = false;
    for (const [, node] of nodeEntries) {
      for (const interaction of node.interactions ?? []) {
        if (interaction.type === 'give' && !interaction.effects?.some((e: any) => e.type === 'remove_item')) {
          interaction.effects.push({ type: 'remove_item', key: interaction.requiresItem ?? items[0].id });
          added = true;
          patternsInjected++;
          break;
        }
      }
      if (added) break;
    }
  }

  if (report.missingEffectTypes.includes('clear_flag')) {
    const entry = findNodeForInjection({ minIndex: 5 });
    if (entry) {
      const [, node] = entry;
      addInteraction(node, {
        id: `enrich_clear_flag_reset`,
        type: 'examine',
        buttonText: 'Clear your mind',
        resultText: `You take a deep breath and let go of your preconceptions. A fresh start.`,
        conditions: [{ type: 'flag_true', key: 'needs_reset' }],
        effects: [{ type: 'clear_flag', key: 'needs_reset', value: false }],
      });
      patternsInjected++;
    }
  }

  if (report.missingEffectTypes.includes('go_to_node') && nodeEntries.length > 3) {
    const entry = findNodeForInjection({ minIndex: 4 });
    if (entry) {
      const [, node] = entry;
      const targetNode = nodeEntries[Math.min(nodeEntries.length - 1, 6)][0];
      addInteraction(node, {
        id: `enrich_surprise_transition`,
        type: 'examine',
        buttonText: 'Investigate the disturbance',
        resultText: `Something unexpected happens — you find yourself somewhere else entirely.`,
        conditions: [],
        effects: [{ type: 'go_to_node', key: targetNode }],
      });
      patternsInjected++;
    }
  }

  if (report.missingEffectTypes.includes('set_variable') && variables.length > 0) {
    const entry = findNodeForInjection({ minIndex: 3 });
    if (entry) {
      const [, node] = entry;
      addInteraction(node, {
        id: `enrich_set_variable_${variables[0]}`,
        type: 'story',
        buttonText: 'Start fresh',
        resultText: `You decide to approach this from a completely new angle.`,
        conditions: [],
        effects: [{ type: 'set_variable', key: variables[0], value: 0 }],
      });
      patternsInjected++;
    }
  }

  if (report.missingEffectTypes.includes('set_object_state') && objects.length > 0) {
    const entry = findNodeForInjection({ hasObject: true, minIndex: 2 });
    if (entry) {
      const [, node] = entry;
      const obj = objects[0];
      const newState = obj.states?.[1] ?? 'activated';
      addInteraction(node, {
        id: `enrich_activate_${obj.id}`,
        type: 'use',
        buttonText: `Activate ${obj.name}`,
        resultText: `You interact with the ${obj.name.toLowerCase()}. It changes before your eyes.`,
        targetObject: obj.id,
        conditions: [],
        effects: [{ type: 'set_object_state', key: obj.id, value: newState }],
      });
      patternsInjected++;
    }
  }

  if (report.missingEffectTypes.includes('change_relation') && characters.length > 0) {
    const entry = findNodeForInjection({ hasCharacter: true, minIndex: 2 });
    if (entry) {
      const [, node] = entry;
      const char = characters[0];
      addInteraction(node, {
        id: `enrich_befriend_${char.id}`,
        type: 'talk',
        buttonText: `Share a story with ${char.name}`,
        resultText: `You share a personal story. ${char.name} smiles warmly — you've grown closer.`,
        targetObject: char.id,
        conditions: [],
        effects: [{ type: 'change_relation', key: char.id, delta: 10 }],
      });
      patternsInjected++;
    }
  }

  report.patternsInjected = patternsInjected;
}

/**
 * 5d: Pad nodes with fewer than 4 interactions
 */
function padMinimumInteractions(gameData: GameData, report: CoverageReport): void {
  let padded = 0;

  for (const [nodeId, node] of Object.entries(gameData.nodes)) {
    if (node.type === 'ending') continue;
    if (!node.interactions) node.interactions = [];

    const count = node.interactions.length;
    if (count >= 4) continue;

    const location = gameData.locations[node.locationId];

    // Add examine interaction if missing
    if (!node.interactions.some((i) => i.type === 'examine')) {
      node.interactions.push({
        id: `pad_examine_${nodeId}`,
        type: 'examine',
        buttonText: `Look around ${location?.name ?? 'the area'}`,
        resultText: `You take in your surroundings, noting every detail of ${(location?.name ?? 'this place').toLowerCase()}.`,
        conditions: [],
        effects: [],
      } as any);
      padded++;
    }

    // Add talk interaction if character present
    if (node.interactions.length < 4 && node.presentCharacters?.length > 0) {
      const charId = node.presentCharacters[0];
      const char = gameData.characters[charId];
      if (char && !node.interactions.some((i) => i.type === 'talk' && i.targetObject === charId)) {
        node.interactions.push({
          id: `pad_talk_${charId}_${nodeId}`,
          type: 'talk',
          buttonText: `Speak with ${char.name}`,
          resultText: `${char.name} acknowledges you with a nod. "What brings you here?" they ask.`,
          targetObject: charId,
          conditions: [],
          effects: [],
        } as any);
        padded++;
      }
    }
  }

  report.interactionsPadded = padded;
}

/**
 * Helper: add interaction to a node's interactions array
 */
function addInteraction(node: any, interaction: Interaction): void {
  if (!node.interactions) node.interactions = [];
  node.interactions.push(interaction);
}

/**
 * Print enrichment report to console
 */
export function printEnrichmentReport(report: CoverageReport): void {
  console.log('\n=== Enrichment Report ===');
  console.log(`Total interactions: ${report.totalInteractions} (avg ${report.avgInteractionsPerNode.toFixed(1)}/node)`);
  console.log(`Navigation loops added: ${report.loopsAdded}`);
  console.log(`Patterns injected: ${report.patternsInjected}`);
  console.log(`Interactions padded: ${report.interactionsPadded}`);

  if (report.missingInteractionTypes.length > 0) {
    console.log(`Still missing interaction types: ${report.missingInteractionTypes.join(', ')}`);
  }
  if (report.missingConditionTypes.length > 0) {
    console.log(`Still missing condition types: ${report.missingConditionTypes.join(', ')}`);
  }
  if (report.missingEffectTypes.length > 0) {
    console.log(`Still missing effect types: ${report.missingEffectTypes.join(', ')}`);
  }
  console.log('========================\n');
}
