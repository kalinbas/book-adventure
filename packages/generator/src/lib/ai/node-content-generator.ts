/**
 * Step 4: Node Content Generation (batched)
 *
 * Takes skeletal GraphNodes from Step 3 and generates full StoryNode
 * content (narrative text, interactions, conditions, effects) in batches
 * of 4-6 nodes per API call.
 */

import { callWithStructuredOutput, callBatchParallel } from './client';
import type { GraphNode, StoryGraph } from './graph/scene-generator';
import type { WorldData } from './world-builder';
import type { StorySummary } from './story-summarizer';
import type { GameData } from './game-data-generator';
import { ENGINE_REFERENCE, getBatchFeatureRequirements } from './engine-reference';

interface GeneratedNode {
  id: string;
  type: 'narrative' | 'choice' | 'ending' | 'checkpoint';
  title: string;
  content: string;
  locationId: string;
  presentCharacters: string[];
  availableObjects: string[];
  interactions: {
    id: string;
    type: string;
    buttonText: string;
    resultText: string;
    targetObject?: string;
    requiresItem?: string;
    conditions: { type: string; key: string; value?: string | number | boolean }[];
    effects: { type: string; key: string; value?: string | number | boolean; delta?: number }[];
    targetNodeId?: string;
  }[];
  onEnter: { type: string; key: string; value?: string | number | boolean; delta?: number }[];
  canonicalPath: boolean;
  divergenceLevel: number;
  mood: string;
  chapterNumber?: number;
  chapterTitle?: string;
}

/**
 * Generate full content for all graph nodes in batches.
 */
export async function generateNodeContent(
  graph: StoryGraph,
  worldData: WorldData,
  summary: StorySummary,
  bookTitle: string,
  apiKey: string,
  concurrency: number = 3,
  onProgress?: (percent: number) => void,
): Promise<Record<string, GeneratedNode>> {
  const batchSize = 5;
  const batches = createBatches(graph.nodes, batchSize);
  const totalBatches = batches.length;

  onProgress?.(5);

  // Build shared context
  const globalContext = buildGlobalContext(summary, bookTitle);
  const worldContext = buildWorldContext(worldData);

  // Create API call functions for each batch
  const calls = batches.map((batch, batchIndex) => {
    return () =>
      generateBatch(
        batch,
        graph,
        globalContext,
        worldContext,
        worldData,
        batchIndex,
        totalBatches,
        apiKey,
      );
  });

  // Execute batches in parallel with concurrency control
  const results = await callBatchParallel(calls, concurrency, (completed, total) => {
    onProgress?.(5 + Math.floor((completed / total) * 90));
  });

  // Merge all results into a single Record
  const allNodes: Record<string, GeneratedNode> = {};
  for (const result of results) {
    const batchNodes = result.data as Record<string, GeneratedNode>;
    for (const [id, node] of Object.entries(batchNodes)) {
      allNodes[id] = node;
    }
  }

  onProgress?.(100);
  return allNodes;
}

/**
 * Split nodes into batches of `size`.
 */
export function createBatches(nodes: GraphNode[], size: number): GraphNode[][] {
  const batches: GraphNode[][] = [];
  for (let i = 0; i < nodes.length; i += size) {
    batches.push(nodes.slice(i, i + size));
  }
  return batches;
}

/**
 * Build global context string (title, themes, tone).
 */
export function buildGlobalContext(summary: StorySummary, bookTitle: string): string {
  return `Game Title: "${bookTitle}: The Adventure"
Themes: ${summary.themes.join(', ')}
Story: ${summary.overview.slice(0, 300)}...`;
}

/**
 * Build world context (available entity IDs).
 */
export function buildWorldContext(worldData: WorldData): string {
  const locIds = Object.keys(worldData.locations);

  const charInfo = Object.entries(worldData.characters)
    .map(([id, c]: [string, any]) => `${id}: "${c.name}"`)
    .join(', ');
  const itemInfo = Object.entries(worldData.items)
    .map(([id, item]: [string, any]) => `${id}: "${item.name}"`)
    .join(', ');
  const objInfo = Object.entries(worldData.objects)
    .map(([id, o]: [string, any]) => `${id}: "${o.name}" [states: ${(o.states ?? []).join('→')}]`)
    .join(', ');
  const varInfo = Object.entries(worldData.variableDefinitions)
    .map(([id, v]: [string, any]) => `${id}: "${v.displayName}"`)
    .join(', ');

  return `Locations: ${locIds.join(', ')}
Characters: ${charInfo}
Items: ${itemInfo}
Objects: ${objInfo}
Variables: ${varInfo}`;
}

/**
 * Generate content for a single batch of graph nodes.
 */
export async function generateBatch(
  batch: GraphNode[],
  graph: StoryGraph,
  globalContext: string,
  worldContext: string,
  worldData: WorldData,
  batchIndex: number,
  totalBatches: number,
  apiKey: string,
) {
  const featureReqs = getBatchFeatureRequirements(batchIndex, totalBatches);

  // Build predecessor context for narrative continuity
  const predecessorContext = buildPredecessorContext(batch, graph);

  const systemPrompt = `You are a narrative game writer generating interactive story nodes for a text adventure.
Write immersive second-person narrative content and create rich, varied interactions.

${ENGINE_REFERENCE}

Output valid JSON only. The JSON should be an object where each key is a node ID and the value is the complete node.`;

  const nodeSpecs = batch
    .map((n) => {
      const charNames = n.presentCharacters
        .map((id) => {
          const c = worldData.characters[id];
          return c ? `${id} ("${(c as any).name}")` : id;
        })
        .join(', ');

      const objNames = n.availableObjects
        .map((id) => {
          const o = worldData.objects[id];
          return o ? `${id} ("${(o as any).name}")` : id;
        })
        .join(', ');

      return `### ${n.id}
- Type: ${n.type}
- Title: ${n.title}
- Location: ${n.locationId}
- Characters present: ${charNames || 'none'}
- Objects available: ${objNames || 'none'}
- Chapter: ${n.chapterNumber} — ${n.chapterTitle}
- Mood: ${n.mood}
- Canonical path: ${n.canonicalPath}
- Divergence level: ${n.divergenceLevel}
- Connects to: ${n.connections.join(', ') || 'none (ending)'}
- Back connections: ${n.backConnections.join(', ') || 'none'}
- Interaction hints: ${n.interactionHints.join(', ')}
${n.plotBeatRef !== undefined ? `- Plot beat: #${n.plotBeatRef}` : ''}`;
    })
    .join('\n\n');

  const userPrompt = `Generate complete story nodes for this batch of ${batch.length} nodes.

## GLOBAL CONTEXT
${globalContext}

## NARRATIVE CONTINUITY
${predecessorContext}

## WORLD ENTITIES
${worldContext}

## NODES TO GENERATE
${nodeSpecs}

## BATCH-SPECIFIC FEATURE REQUIREMENTS
This batch MUST include these engine features:
- Condition types: ${featureReqs.requiredConditions.join(', ')}
- Effect types: ${featureReqs.requiredEffects.join(', ')}
- Interaction types: ${featureReqs.requiredInteractions.join(', ')}

## OUTPUT REQUIREMENTS
For each node, generate:
1. **content**: 2-4 paragraphs of immersive second-person narrative ("You step into..." not "The player...")
2. **interactions**: 4-8 interactions per node (ending nodes get 0)
   - Follow the interaction hints provided but expand them into full interactions
   - Each interaction needs: id, type, buttonText, resultText, conditions, effects
   - "go" interactions MUST have targetNodeId AND a set_location effect
   - "take" interactions need lacks_item condition + add_item effect
   - "give" interactions need has_item condition + remove_item + change_relation effects
   - "use_on" interactions need requiresItem + targetObject + has_item condition
   - "story" interactions for major choices need targetNodeId
   - At least 50% of interactions should have conditions
   - At least 50% of interactions should have effects
3. **onEnter**: effects that trigger when entering the node (e.g., set_flag for visited tracking, change_variable)

## OUTPUT FORMAT
\`\`\`json
{
  "node_id": {
    "id": "node_id",
    "type": "narrative",
    "title": "Scene Title",
    "content": "Narrative text...",
    "locationId": "loc_id",
    "presentCharacters": ["char_id"],
    "availableObjects": ["obj_id"],
    "interactions": [...],
    "onEnter": [...],
    "canonicalPath": true,
    "divergenceLevel": 0,
    "mood": "mysterious",
    "chapterNumber": 1,
    "chapterTitle": "Chapter Title"
  }
}
\`\`\`

Return ONLY valid JSON.`;

  return callWithStructuredOutput<Record<string, GeneratedNode>>(
    apiKey,
    systemPrompt,
    userPrompt,
    {},
    'sonnet',
  );
}

/**
 * Build predecessor context for narrative continuity.
 * Shows brief summaries of nodes that lead into this batch's nodes.
 */
function buildPredecessorContext(batch: GraphNode[], graph: StoryGraph): string {
  const batchIds = new Set(batch.map((n) => n.id));
  const predecessorIds = new Set<string>();

  // Find all nodes that connect TO any node in this batch
  for (const node of graph.nodes) {
    if (batchIds.has(node.id)) continue;
    for (const conn of node.connections) {
      if (batchIds.has(conn)) {
        predecessorIds.add(node.id);
      }
    }
  }

  if (predecessorIds.size === 0) {
    return 'This is the opening batch — no predecessor nodes.';
  }

  const predecessors = graph.nodes
    .filter((n) => predecessorIds.has(n.id))
    .slice(0, 4);

  return `Nodes leading into this batch:\n${predecessors
    .map((n) => `- ${n.id}: "${n.title}" (${n.type}, ${n.mood}, at ${n.locationId})`)
    .join('\n')}`;
}

/**
 * Assemble the final GameData object from all pipeline outputs.
 */
export function assembleGameData(
  bookTitle: string,
  bookAuthor: string,
  graph: StoryGraph,
  worldData: WorldData,
  nodes: Record<string, GeneratedNode>,
): GameData {
  return {
    meta: {
      title: `${bookTitle}: The Adventure`,
      author: 'Generated by Book Adventure',
      bookTitle,
      bookAuthor,
      description: `An interactive text adventure based on "${bookTitle}"`,
      version: '1.0.0',
      generatedAt: new Date().toISOString(),
      engineVersion: '1.0.0',
    },
    initialState: {
      startNodeId: graph.startNodeId,
      startLocationId: worldData.initialState.startLocationId,
      initialInventory: worldData.initialState.initialInventory,
      initialFlags: worldData.initialState.initialFlags,
      initialVariables: worldData.initialState.initialVariables,
    },
    nodes: nodes as any,
    locations: worldData.locations,
    objects: worldData.objects,
    characters: worldData.characters,
    items: worldData.items,
    variableDefinitions: worldData.variableDefinitions,
  };
}
