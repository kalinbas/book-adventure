import { callWithStructuredOutput } from './client';
import type { StorySummary } from './story-summarizer';
import { generateGameDataChunked, type ChunkedGameResult } from './chunked-generator';

// Re-export types from runtime for convenience
export interface GameData {
  meta: {
    title: string;
    author: string;
    bookTitle: string;
    bookAuthor: string;
    description: string;
    version: string;
    generatedAt: string;
    engineVersion: string;
  };
  initialState: {
    startNodeId: string;
    startLocationId: string;
    initialInventory: string[];
    initialFlags: Record<string, boolean>;
    initialVariables: Record<string, number>;
  };
  nodes: Record<string, StoryNode>;
  locations: Record<string, GameLocation>;
  objects: Record<string, GameObject>;
  characters: Record<string, GameCharacter>;
  items: Record<string, Item>;
  variableDefinitions: Record<string, VariableDefinition>;
}

interface StoryNode {
  id: string;
  type: 'narrative' | 'choice' | 'ending' | 'checkpoint' | 'shop' | 'minigame' | 'work';
  title: string;
  content: string;
  locationId: string;
  presentCharacters: string[];
  availableObjects: string[];
  interactions: Interaction[];
  onEnter: Effect[];
  canonicalPath: boolean;
  divergenceLevel: number;
  mood: string;
  chapterRef?: string;
  chapterNumber?: number;
  chapterTitle?: string;
}

interface Interaction {
  id: string;
  type: string;
  buttonText: string;
  resultText: string;
  targetObject?: string;
  requiresItem?: string;
  conditions: Condition[];
  effects: Effect[];
  targetNodeId?: string;
}

interface Condition {
  type: string;
  key: string;
  value?: string | number | boolean;
}

interface Effect {
  type: string;
  key: string;
  value?: string | number | boolean;
  delta?: number;
}

interface GameLocation {
  id: string;
  name: string;
  description: string;
  atmosphere: string;
  exits: Exit[];
  objectIds: string[];
  npcIds: string[];
}

interface Exit {
  direction: string;
  targetLocationId: string;
  conditions: Condition[];
  description: string;
}

interface GameObject {
  id: string;
  name: string;
  description: string;
  canTake: boolean;
  states?: string[];
  initialState?: string;
  interactions: Interaction[];
}

interface GameCharacter {
  id: string;
  name: string;
  description: string;
  dialogue: DialogueTopic[];
  initialRelation: number;
}

interface DialogueTopic {
  id: string;
  keyword: string;
  response: string;
  conditions: Condition[];
  effects: Effect[];
}

interface Item {
  id: string;
  name: string;
  description: string;
  useText?: string;
}

interface VariableDefinition {
  displayName: string;
  min?: number;
  max?: number;
  showInUI: boolean;
}

export interface GenerateGameDataOptions {
  useChunked?: boolean; // Use chunked generation (multiple smaller API calls)
}

/**
 * Generate complete game data from story summary
 * This uses a single API call to generate the entire game structure
 * Use options.useChunked = true for large books to avoid truncation
 */
export async function generateGameData(
  bookTitle: string,
  bookAuthor: string,
  summary: StorySummary,
  apiKey: string,
  onProgress: (percent: number) => void,
  options: GenerateGameDataOptions = {}
): Promise<GameData> {
  onProgress(10);

  // Generate locations from summary
  const locations = generateLocationsFromSummary(summary);
  onProgress(20);

  // Generate characters from summary
  const characters = generateCharactersFromSummary(summary);
  onProgress(30);

  // Generate items from summary
  const items = generateItemsFromSummary(summary);
  onProgress(40);

  // Generate all story nodes
  let nodes: Record<string, StoryNode>;
  let chunkedResult: ChunkedGameResult | null = null;

  if (options.useChunked) {
    // Use chunked generation for large books - returns richer content
    console.log('Using chunked generation (multiple API calls)...');
    chunkedResult = await generateGameDataChunked(
      summary,
      apiKey,
      Object.keys(locations),
      Object.keys(characters),
      Object.keys(items),
      (percent) => onProgress(40 + percent * 0.5)
    );
    nodes = chunkedResult.nodes;

    // Add generated items from chunked generation
    for (const genItem of chunkedResult.generatedItems) {
      items[genItem.id] = {
        id: genItem.id,
        name: genItem.name,
        description: genItem.description,
        useText: genItem.useEffect,
      };
    }

    // Add shop items as purchasable items
    for (const shopItem of chunkedResult.shopItems) {
      if (!items[shopItem.id]) {
        items[shopItem.id] = {
          id: shopItem.id,
          name: shopItem.name,
          description: shopItem.description,
          useText: `Purchased for $${shopItem.price}`,
        };
      }
    }
  } else {
    // Use single API call (may truncate for very large books)
    nodes = await generateAllStoryNodes(summary, apiKey, locations, characters, items);
  }
  onProgress(90);

  // Generate objects (scenery that can be examined but not taken)
  const objects: Record<string, GameObject> = {};
  for (const obj of summary.significantObjects.filter((o) => !o.canBeCarried)) {
    objects[obj.id] = {
      id: obj.id,
      name: obj.name,
      description: obj.description,
      canTake: false,
      interactions: [
        {
          id: `examine_${obj.id}`,
          type: 'examine',
          buttonText: `Examine ${obj.name.toLowerCase()}`,
          resultText: obj.description + ' ' + obj.significance,
          conditions: [],
          effects: [],
        },
      ],
    };
  }

  // Find start node and location
  const sortedNodes = Object.values(nodes).sort((a, b) => {
    const aNum = a.chapterNumber ?? 999;
    const bNum = b.chapterNumber ?? 999;
    return aNum - bNum;
  });
  const startNode = sortedNodes[0];
  const startLocation = startNode?.locationId || Object.keys(locations)[0] || 'start';

  // Variable definitions - always include money when using chunked generation
  const variableDefinitions: Record<string, VariableDefinition> = {};
  if (options.useChunked) {
    variableDefinitions['money'] = {
      displayName: 'Money',
      min: 0,
      showInUI: true,
    };
  }

  onProgress(100);

  return {
    meta: {
      title: `${bookTitle}: The Adventure`,
      author: 'Generated by Book Adventure',
      bookTitle: bookTitle,
      bookAuthor: bookAuthor,
      description: `An interactive text adventure based on "${bookTitle}"`,
      version: '1.0.0',
      generatedAt: new Date().toISOString(),
      engineVersion: '1.0.0',
    },
    initialState: {
      startNodeId: startNode?.id || 'start',
      startLocationId: startLocation,
      initialInventory: [],
      initialFlags: {},
      initialVariables: options.useChunked ? { money: chunkedResult?.startingMoney ?? 10 } : {},
    },
    nodes,
    locations,
    objects,
    characters,
    items,
    variableDefinitions,
  };
}

/**
 * Convert summary locations to game locations
 */
function generateLocationsFromSummary(summary: StorySummary): Record<string, GameLocation> {
  const locations: Record<string, GameLocation> = {};

  for (const loc of summary.locations) {
    locations[loc.id] = {
      id: loc.id,
      name: loc.name,
      description: loc.description,
      atmosphere: loc.atmosphere,
      exits: loc.connectedLocations.map((targetId) => {
        const targetLoc = summary.locations.find((l) => l.id === targetId);
        return {
          direction: `to ${targetLoc?.name || targetId}`,
          targetLocationId: targetId,
          conditions: [],
          description: '',
        };
      }),
      objectIds: [],
      npcIds: [],
    };
  }

  // Ensure at least one location exists
  if (Object.keys(locations).length === 0) {
    locations['default_location'] = {
      id: 'default_location',
      name: 'The Beginning',
      description: 'Where the story begins.',
      atmosphere: 'mysterious',
      exits: [],
      objectIds: [],
      npcIds: [],
    };
  }

  return locations;
}

/**
 * Convert summary characters to game characters
 */
function generateCharactersFromSummary(summary: StorySummary): Record<string, GameCharacter> {
  const characters: Record<string, GameCharacter> = {};

  for (const char of summary.characters) {
    characters[char.id] = {
      id: char.id,
      name: char.name,
      description: char.description,
      dialogue: [],
      initialRelation: char.role === 'antagonist' ? -20 : char.role === 'protagonist' ? 50 : 0,
    };
  }

  return characters;
}

/**
 * Convert summary objects to inventory items
 */
function generateItemsFromSummary(summary: StorySummary): Record<string, Item> {
  const items: Record<string, Item> = {};

  for (const obj of summary.significantObjects.filter((o) => o.canBeCarried)) {
    items[obj.id] = {
      id: obj.id,
      name: obj.name,
      description: obj.description,
      useText: obj.significance,
    };
  }

  return items;
}

/**
 * Generate all story nodes from the summary in a single API call
 */
async function generateAllStoryNodes(
  summary: StorySummary,
  apiKey: string,
  locations: Record<string, GameLocation>,
  characters: Record<string, GameCharacter>,
  items: Record<string, Item>
): Promise<Record<string, StoryNode>> {
  const locationIds = Object.keys(locations);
  const itemIds = Object.keys(items);
  const locationList = Object.values(locations);
  const characterList = Object.values(characters);

  const systemPrompt = `You are an expert interactive fiction game designer. Your task is to create a branching, choice-driven text adventure game.

CRITICAL REQUIREMENTS:
- Every node MUST have 3-6 different interactions (buttons the player can click)
- Nodes MUST branch to DIFFERENT destinations based on player choices
- Use CONDITIONS to gate content (e.g., only show "Use key" if player has_item "key")
- Use EFFECTS to track progress (e.g., set_flag "met_queequeg" when meeting a character)
- Create AT LEAST 3 different endings
- This is a GAME, not a book - players need CHOICES and CONSEQUENCES

You must output valid JSON only. No explanations before or after.`;

  // Build a detailed context about the game elements
  const locationContext = locationList.map(l => `  - ${l.id}: "${l.name}" (${l.atmosphere})`).join('\n');
  const characterContext = characterList.map(c => `  - ${c.id}: "${c.name}"`).join('\n');
  const itemContext = itemIds.length > 0 ? itemIds.map(id => `  - ${id}: "${items[id].name}"`).join('\n') : '  (no items defined)';

  // Build decision points context
  const decisionContext = summary.decisionPoints.map((d, i) =>
    `${i + 1}. ${d.description}
   - Player can: ${d.originalChoice}
   - Or alternatively: ${d.alternatives.join(' OR ')}
   - This affects: ${d.consequences}`
  ).join('\n\n');

  const userPrompt = `Create an interactive text adventure game based on this story.

## STORY SUMMARY
${summary.overview}

## AVAILABLE LOCATIONS
${locationContext}

## CHARACTERS
${characterContext}

## ITEMS PLAYERS CAN FIND
${itemContext}

## KEY DECISION POINTS (create branching paths for these!)
${decisionContext}

## PLOT BEATS TO COVER
${summary.plotProgression.slice(0, 15).map((p, i) => `${i + 1}. ${p.beat} [at ${p.location}] ${p.isDecisionPoint ? '⚠️ BRANCH HERE' : ''}`).join('\n')}

## OUTPUT FORMAT
Return a JSON object where each key is a node ID and the value is the node:

{
  "node_id_here": {
    "id": "node_id_here",
    "type": "narrative",
    "title": "Scene Title",
    "content": "2-3 paragraphs of immersive second-person narrative. Example: 'You push open the heavy wooden door. The smell of tobacco and salt fills your nostrils...'",
    "locationId": "location_id",
    "presentCharacters": ["character_id"],
    "availableObjects": [],
    "interactions": [
      {
        "id": "examine_room",
        "type": "examine",
        "buttonText": "Look around the room",
        "resultText": "You notice a mysterious painting on the wall...",
        "conditions": [],
        "effects": [{"type": "set_flag", "key": "noticed_painting", "value": true}]
      },
      {
        "id": "talk_character",
        "type": "talk",
        "buttonText": "Speak to the innkeeper",
        "resultText": "The innkeeper eyes you warily. 'Looking for a room?'",
        "conditions": [],
        "effects": [{"type": "set_flag", "key": "spoke_to_innkeeper", "value": true}],
        "targetNodeId": "innkeeper_conversation"
      },
      {
        "id": "take_item",
        "type": "take",
        "buttonText": "Pick up the old key",
        "resultText": "You pocket the rusty key.",
        "conditions": [{"type": "flag_true", "key": "noticed_key"}],
        "effects": [{"type": "add_item", "key": "old_key"}]
      },
      {
        "id": "choice_accept",
        "type": "story",
        "buttonText": "Accept the strange offer",
        "resultText": "Against your better judgment, you agree...",
        "conditions": [],
        "effects": [{"type": "set_flag", "key": "accepted_offer", "value": true}],
        "targetNodeId": "accepted_path"
      },
      {
        "id": "choice_refuse",
        "type": "story",
        "buttonText": "Politely decline",
        "resultText": "You shake your head. Something feels wrong about this...",
        "conditions": [],
        "effects": [{"type": "set_flag", "key": "refused_offer", "value": true}],
        "targetNodeId": "refused_path"
      }
    ],
    "onEnter": [],
    "canonicalPath": true,
    "divergenceLevel": 0,
    "mood": "mysterious",
    "chapterNumber": 1,
    "chapterTitle": "The Beginning"
  }
}

## STRICT REQUIREMENTS
1. Create 15-25 nodes covering the story
2. EVERY node must have 3-6 interactions (NOT just one "Continue" button!)
3. Include interaction types: examine, talk, take, story (for major choices)
4. Use conditions like {"type": "has_item", "key": "item_id"} or {"type": "flag_true", "key": "flag_name"}
5. Use effects like {"type": "add_item", "key": "item_id"} or {"type": "set_flag", "key": "flag_name", "value": true}
6. At decision points, create 2-3 different "story" interactions leading to DIFFERENT nodes
7. Create at least 3 ending nodes (type: "ending") - good, bad, and neutral endings
8. Make sure all targetNodeId values reference actual node IDs you create

Return ONLY the JSON object. No markdown, no explanations.`;

  const response = await callWithStructuredOutput<Record<string, StoryNode>>(
    apiKey,
    systemPrompt,
    userPrompt,
    {},
    'sonnet'
  );

  const nodes = response.data;

  // Validate the response - check if it's a proper interactive game
  const nodeList = Object.values(nodes);
  const totalInteractions = nodeList.reduce((sum, n) => sum + (n.interactions?.length || 0), 0);
  const avgInteractions = totalInteractions / nodeList.length;
  const hasMultipleTargets = nodeList.some(n => {
    const targets = new Set(n.interactions?.filter(i => i.targetNodeId).map(i => i.targetNodeId));
    return targets.size > 1;
  });
  const endingCount = nodeList.filter(n => n.type === 'ending').length;

  console.log(`Generated ${nodeList.length} nodes with avg ${avgInteractions.toFixed(1)} interactions, ${endingCount} endings, hasMultipleTargets: ${hasMultipleTargets}`);

  // If the response is too simple (looks like fallback), throw an error
  if (nodeList.length > 0 && avgInteractions < 1.5 && !hasMultipleTargets) {
    throw new Error(`Generated game is too linear. Average interactions per node: ${avgInteractions.toFixed(1)}. This doesn't look like an interactive game.`);
  }

  // Ensure ending node exists
  if (endingCount === 0) {
    const endingId = 'ending_main';
    nodes[endingId] = {
      id: endingId,
      type: 'ending',
      title: 'The End',
      content: 'Your journey comes to an end. The choices you made have shaped your story, and now it is complete.',
      locationId: locationIds[0] || 'default_location',
      presentCharacters: [],
      availableObjects: [],
      interactions: [],
      onEnter: [],
      canonicalPath: true,
      divergenceLevel: 0,
      mood: 'neutral',
      chapterNumber: 999,
      chapterTitle: 'The End',
    };
  }

  // Fix any dangling node references
  const nodeIds = new Set(Object.keys(nodes));
  for (const node of Object.values(nodes)) {
    if (!node.interactions) node.interactions = [];
    for (const interaction of node.interactions) {
      if (interaction.targetNodeId && !nodeIds.has(interaction.targetNodeId)) {
        // Point to an ending if target doesn't exist
        const endingNode = Object.values(nodes).find((n) => n.type === 'ending');
        interaction.targetNodeId = endingNode?.id || 'ending_main';
      }
    }
  }

  return nodes;
}

