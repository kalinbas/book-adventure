/**
 * Step 3: Story Graph Generation
 *
 * Two modes:
 * - Flat mode (≤100 nodes): single call produces all GraphNodes
 * - Chapter mode (>100 nodes): generates scenes for a single chapter
 *
 * Generates the skeletal node structure: IDs, types, connections,
 * interaction hints — but NOT narrative content.
 */

import { callWithStructuredOutput } from '../client';
import type { StorySummary } from '../story-summarizer';
import type { WorldData } from '../world-builder';
import type { ChapterStructure } from './chapter-generator';
import { ENGINE_REFERENCE } from '../engine-reference';

export interface GraphNode {
  id: string;
  type: 'narrative' | 'choice' | 'ending' | 'checkpoint';
  title: string;
  locationId: string;
  presentCharacters: string[];
  availableObjects: string[];
  chapterNumber: number;
  chapterTitle: string;
  mood: string;
  canonicalPath: boolean;
  divergenceLevel: number;
  connections: string[];
  backConnections: string[];
  interactionHints: string[];
  plotBeatRef?: number;
}

export interface StoryGraph {
  nodes: GraphNode[];
  startNodeId: string;
  actStructure: {
    act: number;
    nodeIds: string[];
    description: string;
  }[];
}

export async function generateStoryGraph(
  summary: StorySummary,
  worldData: WorldData,
  apiKey: string,
  targetNodes: number = 44,
  onProgress?: (percent: number) => void,
): Promise<StoryGraph> {
  onProgress?.(10);

  const locationIds = Object.keys(worldData.locations);
  const characterIds = Object.keys(worldData.characters);
  const objectIds = Object.keys(worldData.objects);
  const itemIds = Object.keys(worldData.items);
  const variableIds = Object.keys(worldData.variableDefinitions);

  const choiceNodes = Math.max(7, Math.floor(targetNodes * 0.15));
  const endingNodes = Math.max(3, Math.floor(targetNodes * 0.07));
  const checkpointNodes = Math.max(2, Math.floor(targetNodes * 0.05));

  const systemPrompt = `You are a game narrative architect designing the node graph for an interactive text adventure.
Your job is to create the STRUCTURE of the game — node IDs, types, connections, and interaction hints.
Do NOT write narrative content — just the skeletal structure.

${ENGINE_REFERENCE}

Output valid JSON only.`;

  const userPrompt = `Design the story graph for a text adventure based on this story:

## STORY OVERVIEW
${summary.overview}

## PLOT BEATS TO COVER
${summary.plotProgression.slice(0, 25).map((p) => `${p.beatNumber}. ${p.beat} [${p.location}] ${p.isDecisionPoint ? '⭐ DECISION POINT' : ''}`).join('\n')}

## DECISION POINTS
${summary.decisionPoints.slice(0, 15).map((d) => `- ${d.description}: ${d.alternatives.join(' OR ')}`).join('\n')}

## AVAILABLE IDS
Locations: ${locationIds.join(', ')}
Characters: ${characterIds.join(', ')}
Objects: ${objectIds.join(', ')}
Items: ${itemIds.join(', ')}
Variables: ${variableIds.join(', ')}

## REQUIREMENTS

### Node Count: ${targetNodes} total
- ~${targetNodes - choiceNodes - endingNodes - checkpointNodes} narrative nodes
- ${choiceNodes} choice nodes (major decisions with 2-4 different branches)
- ${endingNodes} ending nodes (good, bad, neutral, and variations)
- ${checkpointNodes} checkpoint nodes (act transitions)

### Node Structure
Each node needs:
- id: unique snake_case ID
- type: "narrative" | "choice" | "ending" | "checkpoint"
- title: short descriptive title
- locationId: one of the available location IDs
- presentCharacters: array of character IDs present in this scene
- availableObjects: array of object IDs in this scene
- chapterNumber: sequential chapter number
- chapterTitle: chapter name
- mood: "neutral"|"tense"|"joyful"|"mysterious"|"action"|"romantic"|"sad"
- canonicalPath: true if this follows the book's main plot
- divergenceLevel: 0 for canonical, 1-3 for alternate paths
- connections: array of node IDs this node can lead to (forward)
- backConnections: array of node IDs players can return to from here (for navigation loops)
- interactionHints: array of strings like "examine:scenery", "take:item_id", "talk:char_id", "use_on:item_id:object_id", "ask:char_id:topic", "give:item_id:char_id", "go:target_node_id", "story:choice_description"

### Interaction Hints (must collectively cover ALL 9 types)
Target quotas across all nodes:
- examine: 15+ hints
- take: 8+ hints (reference actual item IDs)
- use: 6+ hints
- use_on: 2+ hints (format: "use_on:item_id:object_id")
- talk: 12+ hints (reference actual character IDs)
- ask: 3+ hints (format: "ask:char_id:topic")
- give: 2+ hints (format: "give:item_id:char_id")
- go: 30+ hints (reference actual target node IDs)
- story: 20+ hints (major narrative choices)

### Navigation
- At least 15 backConnections total (loops back to hub/checkpoint nodes)
- Every choice node must have 2+ different connections
- No dead ends — every non-ending node must connect forward
- Act structure: 3 acts with clear transitions

### Branching
- Include relationship-building paths for 2-3 key characters
- Include variable-gated paths (choices requiring high variable values)
- Include item-gated paths (choices requiring specific items)
- Include object state progressions across connected nodes

## OUTPUT FORMAT
\`\`\`json
{
  "nodes": [ { ... } ],
  "startNodeId": "first_node_id",
  "actStructure": [
    { "act": 1, "nodeIds": ["node1", "node2"], "description": "Act 1 summary" }
  ]
}
\`\`\`

Return ONLY valid JSON.`;

  onProgress?.(30);

  const response = await callWithStructuredOutput<StoryGraph>(
    apiKey,
    systemPrompt,
    userPrompt,
    {},
    'sonnet',
  );

  onProgress?.(100);
  return response.data;
}

/**
 * Generate scene graph for a single chapter (used in hierarchical mode).
 */
export async function generateChapterSceneGraph(
  chapter: ChapterStructure['chapters'][number],
  _summary: StorySummary,
  worldData: WorldData,
  apiKey: string,
  onProgress?: (percent: number) => void,
): Promise<GraphNode[]> {
  onProgress?.(10);

  const locationIds = chapter.locations.length > 0
    ? chapter.locations
    : Object.keys(worldData.locations).slice(0, 10);
  const characterIds = chapter.characters.length > 0
    ? chapter.characters
    : Object.keys(worldData.characters).slice(0, 8);
  const objectIds = Object.keys(worldData.objects);
  const itemIds = Object.keys(worldData.items);

  const systemPrompt = `You are a game narrative architect generating scene nodes for a single chapter of a text adventure.
Create the STRUCTURE only — node IDs, types, connections, interaction hints. No narrative content.

${ENGINE_REFERENCE}

Output valid JSON only.`;

  const userPrompt = `Generate ${chapter.targetNodeCount} scene nodes for chapter "${chapter.title}" (${chapter.id}).

## CHAPTER SUMMARY
${chapter.summary}

## NARRATIVE ARCS
${chapter.narrativeArcs.map((a) => `- ${a.id} (${a.isCanonical ? 'canonical' : 'alternate'}): ${a.summary}${a.branchCondition ? ` [requires: ${a.branchCondition}]` : ''}`).join('\n')}

## ENTRY PORTS
${chapter.entryPorts.join(', ')}

## EXIT PORTS
${chapter.exitPorts.join(', ')}

## AVAILABLE IDS
Locations: ${locationIds.join(', ')}
Characters: ${characterIds.join(', ')}
Objects: ${objectIds.join(', ')}
Items: ${itemIds.join(', ')}

## REQUIREMENTS
- Generate exactly ${chapter.targetNodeCount} nodes
- First node(s) should be reachable via entry ports
- Last node(s) should connect to exit ports
- Use exit port names in connections for cross-chapter links
- Include at least 1 choice node and 1 ending node (if this is a final chapter)
- Each non-ending node needs 3-6 interaction hints

## OUTPUT FORMAT
Return a JSON array of GraphNode objects:
\`\`\`json
[
  {
    "id": "unique_node_id",
    "type": "narrative",
    "title": "Scene Title",
    "locationId": "loc_id",
    "presentCharacters": ["char_id"],
    "availableObjects": ["obj_id"],
    "chapterNumber": 1,
    "chapterTitle": "${chapter.title}",
    "mood": "mysterious",
    "canonicalPath": true,
    "divergenceLevel": 0,
    "connections": ["next_node_id"],
    "backConnections": [],
    "interactionHints": ["examine:scenery", "talk:char_id"]
  }
]
\`\`\`

Return ONLY valid JSON.`;

  onProgress?.(30);

  const response = await callWithStructuredOutput<GraphNode[]>(
    apiKey,
    systemPrompt,
    userPrompt,
    {},
    'sonnet',
  );

  onProgress?.(100);
  return response.data;
}
