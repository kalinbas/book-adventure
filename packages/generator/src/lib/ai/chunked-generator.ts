/**
 * Chunked Game Generator
 * Splits game generation into smaller API calls to avoid truncation
 *
 * Phase 1: Generate graph structure (node IDs, connections, types)
 * Phase 2: Generate content for each node in batches
 * Phase 3: Generate items, money opportunities, and mini-games
 */

import { callWithStructuredOutput } from './client';
import type { StorySummary } from './story-summarizer';

// Types for the generation phases
interface GraphNode {
  id: string;
  type: 'narrative' | 'choice' | 'ending' | 'checkpoint' | 'shop' | 'minigame' | 'work';
  title: string;
  locationId: string;
  chapterNumber?: number;
  chapterTitle?: string;
  connections: string[]; // Node IDs this connects to
  mood: string;
  canonicalPath: boolean;
  divergenceLevel: number;
  hasShop?: boolean;
  hasMinigame?: boolean;
  canEarnMoney?: boolean;
}

interface GraphStructure {
  nodes: GraphNode[];
  startNodeId: string;
  gameItems: GameItem[];
  shopItems: ShopItem[];
}

interface GameItem {
  id: string;
  name: string;
  description: string;
  canTake: boolean;
  useEffect?: string; // What happens when used
  useLocations?: string[]; // Where it can be used
  combinableWith?: string[]; // Other items it combines with
}

interface ShopItem {
  id: string;
  name: string;
  description: string;
  price: number;
  locationId: string;
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

/**
 * Result from chunked generation including items and money config
 */
export interface ChunkedGameResult {
  nodes: Record<string, StoryNode>;
  generatedItems: GameItem[];
  shopItems: ShopItem[];
  startingMoney: number;
}

/**
 * Generate game data using chunked approach
 * This splits generation into multiple smaller API calls
 */
export async function generateGameDataChunked(
  summary: StorySummary,
  apiKey: string,
  locationIds: string[],
  characterIds: string[],
  itemIds: string[],
  onProgress: (percent: number) => void
): Promise<ChunkedGameResult> {
  // Phase 1: Generate graph structure with items (~3-4K tokens output)
  onProgress(10);
  console.log('Phase 1: Generating graph structure with items and economy...');
  const graph = await generateGraphStructure(summary, apiKey, locationIds);
  console.log(`Generated graph with ${graph.nodes.length} nodes, ${graph.gameItems.length} items, ${graph.shopItems.length} shop items`);
  onProgress(25);

  // Phase 2: Generate content in batches
  const BATCH_SIZE = 4; // Smaller batches for richer content
  const allNodes: Record<string, StoryNode> = {};
  const batches = chunkArray(graph.nodes, BATCH_SIZE);

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    const batchProgress = 25 + ((i + 1) / batches.length) * 65;

    console.log(`Phase 2: Generating batch ${i + 1}/${batches.length} (${batch.length} nodes)...`);

    const batchNodes = await generateNodeBatch(
      batch,
      summary,
      apiKey,
      locationIds,
      characterIds,
      itemIds,
      graph.nodes,
      graph.gameItems,
      graph.shopItems
    );

    // Merge into all nodes
    Object.assign(allNodes, batchNodes);
    onProgress(batchProgress);
  }

  onProgress(95);

  // Validate and fix connections
  const nodeIds = new Set(Object.keys(allNodes));
  for (const node of Object.values(allNodes)) {
    for (const interaction of node.interactions) {
      if (interaction.targetNodeId && !nodeIds.has(interaction.targetNodeId)) {
        // Fix dangling reference
        const endingNode = Object.values(allNodes).find((n) => n.type === 'ending');
        interaction.targetNodeId = endingNode?.id || undefined;
      }
    }
  }

  // Ensure at least one ending exists
  const hasEnding = Object.values(allNodes).some((n) => n.type === 'ending');
  if (!hasEnding) {
    allNodes['ending_main'] = {
      id: 'ending_main',
      type: 'ending',
      title: 'The End',
      content: 'Your journey comes to an end. The choices you made have shaped your story.',
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

  onProgress(100);
  return {
    nodes: allNodes,
    generatedItems: graph.gameItems,
    shopItems: graph.shopItems,
    startingMoney: 10, // Start with some money
  };
}

/**
 * Phase 1: Generate the graph structure with items and economy
 * Includes story nodes, collectible items, shop items, and money opportunities
 */
async function generateGraphStructure(
  summary: StorySummary,
  apiKey: string,
  locationIds: string[]
): Promise<GraphStructure> {
  const systemPrompt = `You are a game designer creating an interactive text adventure with:
- Rich branching narrative with 35-50 story nodes
- An economy system with money (coins/dollars)
- Collectible and purchasable items
- Mini-games and work opportunities to earn money
- Items that can be used later to unlock paths or solve puzzles

Output a JSON object with the complete game structure.`;

  const decisionContext = summary.decisionPoints
    .slice(0, 15)
    .map((d, i) => `${i + 1}. ${d.description} - Options: ${d.alternatives.join(' OR ')}`)
    .join('\n');

  const plotContext = summary.plotProgression
    .slice(0, 20)
    .map((p, i) => `${i + 1}. ${p.beat} [${p.location}]${p.isDecisionPoint ? ' ⚠️BRANCH' : ''}`)
    .join('\n');

  const userPrompt = `Create a RICH, INTERACTIVE story graph structure for this story:

## OVERVIEW
${summary.overview}

## KEY DECISION POINTS (create branches here!)
${decisionContext}

## PLOT PROGRESSION
${plotContext}

## AVAILABLE LOCATIONS
${locationIds.join(', ')}

## REQUIREMENTS - MUST FOLLOW!

### NODES (35-50 total)
- "narrative": Regular story scenes with exploration
- "choice": Major decision points with 2-4 branches
- "shop": Places to buy items (at least 3 shops)
- "work": Places to earn money through tasks (at least 3)
- "minigame": Challenge/puzzle scenes (at least 2)
- "ending": Multiple endings (at least 5: great, good, neutral, bad, terrible)

### ITEMS (10-15 items)
Create items that:
- Can be FOUND during exploration (free)
- Can be PURCHASED at shops
- Have USES later in the story (unlock paths, solve puzzles)
- Some are REQUIRED to reach certain endings
- Some COMBINE with other items

### ECONOMY
- Player starts with some money
- Money earned through: work nodes, selling items, completing tasks, finding treasure
- Money spent on: shops, bribes, services, gambling

### BRANCHING
- At least 8 major branch points
- Decisions should have CONSEQUENCES (different paths, different items available)
- Some branches require specific items to access
- Some branches require minimum money

Return JSON in this EXACT format:
{
  "nodes": [
    {
      "id": "unique_node_id",
      "type": "narrative",
      "title": "Scene Title",
      "locationId": "location_id",
      "chapterNumber": 1,
      "chapterTitle": "Chapter Title",
      "connections": ["node_a", "node_b", "node_c"],
      "mood": "mysterious",
      "canonicalPath": true,
      "divergenceLevel": 0,
      "hasShop": false,
      "hasMinigame": false,
      "canEarnMoney": false
    },
    {
      "id": "tavern_shop",
      "type": "shop",
      "title": "The Tavern",
      "locationId": "tavern",
      "connections": ["tavern_main"],
      "mood": "cozy",
      "canonicalPath": false,
      "divergenceLevel": 1,
      "hasShop": true
    },
    {
      "id": "docks_work",
      "type": "work",
      "title": "Work at the Docks",
      "locationId": "docks",
      "connections": ["docks_main"],
      "mood": "laborious",
      "canonicalPath": false,
      "divergenceLevel": 1,
      "canEarnMoney": true
    }
  ],
  "startNodeId": "first_node_id",
  "gameItems": [
    {
      "id": "rope",
      "name": "Sturdy Rope",
      "description": "A coil of strong hemp rope",
      "canTake": true,
      "useEffect": "Can be used to climb or tie things",
      "useLocations": ["cliffs", "ship_rigging"],
      "combinableWith": ["hook"]
    },
    {
      "id": "lantern",
      "name": "Oil Lantern",
      "description": "A brass lantern that provides light",
      "canTake": true,
      "useEffect": "Illuminates dark areas",
      "useLocations": ["caves", "ship_hold", "night_scenes"]
    }
  ],
  "shopItems": [
    {
      "id": "harpoon",
      "name": "Whaling Harpoon",
      "description": "A sharp harpoon for hunting whales",
      "price": 25,
      "locationId": "equipment_shop"
    },
    {
      "id": "medicine",
      "name": "Healing Salve",
      "description": "Treats wounds and illness",
      "price": 10,
      "locationId": "apothecary"
    }
  ]
}

Node types: "narrative", "choice", "shop", "work", "minigame", "ending"
Return ONLY valid JSON with 35-50 nodes, 10-15 items, and 5-10 shop items.`;

  const response = await callWithStructuredOutput<GraphStructure>(
    apiKey,
    systemPrompt,
    userPrompt,
    {},
    'sonnet'
  );

  // Validate the response
  if (!response.data.nodes || response.data.nodes.length === 0) {
    throw new Error('Graph generation returned no nodes');
  }

  // Ensure defaults
  if (!response.data.gameItems) {
    response.data.gameItems = [];
  }
  if (!response.data.shopItems) {
    response.data.shopItems = [];
  }

  // Ensure all nodes have valid location IDs
  for (const node of response.data.nodes) {
    if (!locationIds.includes(node.locationId)) {
      node.locationId = locationIds[0] || 'default_location';
    }
  }

  return response.data;
}

/**
 * Phase 2: Generate content for a batch of nodes
 */
async function generateNodeBatch(
  batchNodes: GraphNode[],
  summary: StorySummary,
  apiKey: string,
  _locationIds: string[],
  characterIds: string[],
  itemIds: string[],
  _allGraphNodes: GraphNode[],
  gameItems: GameItem[],
  shopItems: ShopItem[]
): Promise<Record<string, StoryNode>> {
  const systemPrompt = `You are a game writer creating RICH, INTERACTIVE story content.
Each node must have 4-8 meaningful interactions including:
- Exploration (examine, search, investigate)
- Item interactions (take, use, combine)
- Character interactions (talk, ask, give, bribe)
- Economic actions (buy, sell, work, gamble)
- Story progression (multiple paths with different requirements)

The game has a MONEY system - use "change_variable" with key "money" for earning/spending.
Items should UNLOCK new options when you have them.
Output valid JSON only.`;

  // Build context about what nodes we're generating
  const nodeContext = batchNodes
    .map((n) => {
      const connectsTo = n.connections.join(', ') || 'none';
      const special = [];
      if (n.hasShop) special.push('HAS_SHOP');
      if (n.canEarnMoney) special.push('CAN_EARN_MONEY');
      if (n.hasMinigame) special.push('HAS_MINIGAME');
      const specialStr = special.length > 0 ? ` [${special.join(', ')}]` : '';
      return `- ${n.id} (${n.type}): "${n.title}" at ${n.locationId}${specialStr}, connects to: [${connectsTo}]`;
    })
    .join('\n');

  // Items context
  const itemsContext = gameItems.slice(0, 15).map(item =>
    `- ${item.id}: "${item.name}" - ${item.description}${item.useEffect ? ` (Use: ${item.useEffect})` : ''}`
  ).join('\n');

  // Shop items context
  const shopContext = shopItems.slice(0, 10).map(item =>
    `- ${item.id}: "${item.name}" - $${item.price} at ${item.locationId}`
  ).join('\n');

  // Find which characters/items might be relevant based on locations
  const relevantLocations = [...new Set(batchNodes.map((n) => n.locationId))];

  const userPrompt = `Generate RICH, INTERACTIVE content for these story nodes:

## NODES TO GENERATE
${nodeContext}

## STORY CONTEXT
${summary.overview}

## AVAILABLE ITEMS (can be found, used, or required)
${itemsContext || 'No special items defined'}

## SHOP ITEMS (can be purchased)
${shopContext || 'No shop items defined'}

## AVAILABLE ELEMENTS
- Locations: ${relevantLocations.join(', ')}
- Characters: ${characterIds.slice(0, 10).join(', ')}
- Base Items: ${itemIds.slice(0, 10).join(', ')}

## REQUIREMENTS FOR EACH NODE (MUST FOLLOW!)

### ALL NODES must have 4-8 interactions including:
1. At least 2 "examine" interactions (look at things, search areas)
2. At least 1 item interaction (take item OR use item requirement)
3. At least 2 story/navigation options

### SHOP NODES must include:
- "buy" type interactions with condition {"type": "variable_gte", "key": "money", "value": PRICE}
- Effect: {"type": "change_variable", "key": "money", "delta": -PRICE} AND {"type": "add_item", "key": "item_id"}
- Multiple items to choose from

### WORK NODES must include:
- Task interactions that EARN money
- Effect: {"type": "change_variable", "key": "money", "delta": 5} (or similar amount)
- Maybe set a flag so work can only be done once per visit

### MINIGAME NODES must include:
- Challenge with success/failure paths
- Rewards for success (money or items)
- Different outcomes based on items you have

### ITEM USAGE
- Some paths require items: {"type": "has_item", "key": "rope"}
- Some paths require money: {"type": "variable_gte", "key": "money", "value": 20}
- Using items can unlock new options or give advantages

### BRANCHING
- Choice nodes: 2-4 different targetNodeId options
- Some branches REQUIRE items or money
- Some branches change based on flags

## OUTPUT FORMAT
{
  "node_id": {
    "id": "node_id",
    "type": "narrative",
    "title": "Scene Title",
    "content": "You step into... [2-3 immersive paragraphs in second person]",
    "locationId": "location_id",
    "presentCharacters": ["char_id"],
    "availableObjects": ["item_id"],
    "interactions": [
      {
        "id": "search_area",
        "type": "examine",
        "buttonText": "Search the dusty corner",
        "resultText": "You find some coins hidden in a crack!",
        "conditions": [{"type": "flag_false", "key": "searched_corner"}],
        "effects": [
          {"type": "set_flag", "key": "searched_corner", "value": true},
          {"type": "change_variable", "key": "money", "delta": 3}
        ]
      },
      {
        "id": "take_rope",
        "type": "take",
        "buttonText": "Take the rope",
        "resultText": "You coil the rope and add it to your belongings.",
        "conditions": [{"type": "lacks_item", "key": "rope"}],
        "effects": [{"type": "add_item", "key": "rope"}]
      },
      {
        "id": "use_rope_climb",
        "type": "use",
        "buttonText": "Use rope to climb up",
        "resultText": "You secure the rope and climb to the upper level.",
        "conditions": [{"type": "has_item", "key": "rope"}],
        "effects": [],
        "targetNodeId": "upper_level"
      },
      {
        "id": "buy_lantern",
        "type": "buy",
        "buttonText": "Buy lantern ($10)",
        "resultText": "You hand over the coins and receive a gleaming brass lantern.",
        "conditions": [
          {"type": "variable_gte", "key": "money", "value": 10},
          {"type": "lacks_item", "key": "lantern"}
        ],
        "effects": [
          {"type": "change_variable", "key": "money", "delta": -10},
          {"type": "add_item", "key": "lantern"}
        ]
      },
      {
        "id": "bribe_guard",
        "type": "give",
        "buttonText": "Bribe the guard ($15)",
        "resultText": "The guard pockets the coins and looks the other way.",
        "conditions": [{"type": "variable_gte", "key": "money", "value": 15}],
        "effects": [
          {"type": "change_variable", "key": "money", "delta": -15},
          {"type": "set_flag", "key": "bribed_guard", "value": true}
        ],
        "targetNodeId": "secret_passage"
      },
      {
        "id": "path_a",
        "type": "story",
        "buttonText": "Take the dangerous path",
        "resultText": "You steel yourself and venture into darkness...",
        "conditions": [],
        "effects": [],
        "targetNodeId": "dangerous_path"
      },
      {
        "id": "path_b_requires_item",
        "type": "story",
        "buttonText": "Light the way with your lantern",
        "resultText": "The lantern reveals a safer passage...",
        "conditions": [{"type": "has_item", "key": "lantern"}],
        "effects": [],
        "targetNodeId": "safe_path"
      }
    ],
    "onEnter": [],
    "canonicalPath": true,
    "divergenceLevel": 0,
    "mood": "mysterious",
    "chapterNumber": 1,
    "chapterTitle": "Chapter One"
  }
}

Generate content for EXACTLY these nodes: ${batchNodes.map((n) => n.id).join(', ')}
Each node MUST have 4-8 interactions. Endings have 0 interactions.
Return ONLY valid JSON.`;

  const response = await callWithStructuredOutput<Record<string, StoryNode>>(
    apiKey,
    systemPrompt,
    userPrompt,
    {},
    'sonnet'
  );

  // Validate each node in the response
  const result: Record<string, StoryNode> = {};

  for (const graphNode of batchNodes) {
    const generatedNode = response.data[graphNode.id];

    if (generatedNode) {
      // Ensure required fields
      result[graphNode.id] = {
        ...generatedNode,
        id: graphNode.id,
        type: graphNode.type,
        locationId: graphNode.locationId,
        chapterNumber: graphNode.chapterNumber,
        chapterTitle: graphNode.chapterTitle,
        canonicalPath: graphNode.canonicalPath,
        divergenceLevel: graphNode.divergenceLevel,
        mood: graphNode.mood || 'neutral',
        presentCharacters: generatedNode.presentCharacters || [],
        availableObjects: generatedNode.availableObjects || [],
        interactions: generatedNode.interactions || [],
        onEnter: generatedNode.onEnter || [],
      };

      // Ensure interactions array exists and has items
      if (!result[graphNode.id].interactions || result[graphNode.id].interactions.length === 0) {
        // Add a minimal interaction based on connections
        if (graphNode.connections.length > 0) {
          result[graphNode.id].interactions = graphNode.connections.map((targetId, idx) => ({
            id: `continue_${idx}`,
            type: 'story',
            buttonText: idx === 0 ? 'Continue' : `Alternative path ${idx + 1}`,
            resultText: 'You decide to continue your journey...',
            conditions: [],
            effects: [],
            targetNodeId: targetId,
          }));
        }
      }
    } else {
      // Create a fallback node if generation missed this one
      console.warn(`Node ${graphNode.id} was not generated, creating fallback`);
      result[graphNode.id] = {
        id: graphNode.id,
        type: graphNode.type,
        title: graphNode.title,
        content: `The story continues... (${graphNode.title})`,
        locationId: graphNode.locationId,
        presentCharacters: [],
        availableObjects: [],
        interactions: graphNode.connections.map((targetId, idx) => ({
          id: `continue_${idx}`,
          type: 'story',
          buttonText: idx === 0 ? 'Continue' : `Alternative ${idx + 1}`,
          resultText: 'You press onward...',
          conditions: [],
          effects: [],
          targetNodeId: targetId,
        })),
        onEnter: [],
        canonicalPath: graphNode.canonicalPath,
        divergenceLevel: graphNode.divergenceLevel,
        mood: graphNode.mood || 'neutral',
        chapterNumber: graphNode.chapterNumber,
        chapterTitle: graphNode.chapterTitle,
      };
    }
  }

  return result;
}

/**
 * Split array into chunks of specified size
 */
function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}
