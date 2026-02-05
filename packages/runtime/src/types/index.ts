// =============================================================================
// GAME STATE
// =============================================================================

export interface GameState {
  // Current position
  currentNodeId: string;
  currentLocationId: string;

  // Inventory - item IDs the player carries
  inventory: string[];

  // World state
  objectStates: Record<string, string>; // e.g., { "door": "locked", "guard": "asleep" }
  flags: Record<string, boolean>; // e.g., { "met_wizard": true, "has_map": false }
  variables: Record<string, number>; // e.g., { "gold": 50, "reputation": 75 }

  // Character relationships (-100 to 100)
  characterRelations: Record<string, number>; // e.g., { "darcy": -50, "jane": 80 }

  // Interactions already executed on the current node (reset on node change)
  executedInteractions: string[];

  // History
  visitedNodes: string[];
  visitedLocations: string[];
}

// =============================================================================
// CONDITIONS - Determine when actions are available
// =============================================================================

export type ConditionType =
  | 'has_item'
  | 'lacks_item'
  | 'flag_true'
  | 'flag_false'
  | 'object_state'
  | 'object_state_not'
  | 'visited_node'
  | 'not_visited_node'
  | 'visited_location'
  | 'variable_eq'
  | 'variable_gte'
  | 'variable_lte'
  | 'variable_gt'
  | 'variable_lt'
  | 'relation_gte'
  | 'relation_lte'
  | 'in_location';

export interface Condition {
  type: ConditionType;
  key: string;
  value?: string | number | boolean;
}

// =============================================================================
// EFFECTS - Changes to game state when an action is taken
// =============================================================================

export type EffectType =
  | 'add_item'
  | 'remove_item'
  | 'set_flag'
  | 'clear_flag'
  | 'set_object_state'
  | 'set_variable'
  | 'change_variable'
  | 'change_relation'
  | 'go_to_node'
  | 'set_location';

export interface Effect {
  type: EffectType;
  key: string;
  value?: string | number | boolean;
  delta?: number; // For change_variable/change_relation
}

// =============================================================================
// INTERACTIONS - Actions the player can take
// =============================================================================

export type InteractionType =
  | 'examine'
  | 'take'
  | 'use'
  | 'use_on'
  | 'talk'
  | 'ask'
  | 'give'
  | 'go'
  | 'story';

export interface Interaction {
  id: string;
  type: InteractionType;

  // Display
  buttonText: string; // "Open the creaky door"
  resultText: string; // "The door swings open revealing..."

  // Targeting (optional)
  targetObject?: string; // Object/NPC this applies to
  requiresItem?: string; // Item needed (for use_on, give)

  // Conditions (ALL must be true for button to appear)
  conditions: Condition[];

  // Effects (applied when clicked)
  effects: Effect[];

  // Navigation (if action leads to new node)
  targetNodeId?: string;
}

// =============================================================================
// STORY NODES - Passages in the narrative
// =============================================================================

export type NodeType = 'narrative' | 'choice' | 'ending' | 'checkpoint';
export type Mood = 'neutral' | 'tense' | 'joyful' | 'mysterious' | 'action' | 'romantic' | 'sad';

export interface StoryNode {
  id: string;
  type: NodeType;
  title: string;
  content: string; // Main narrative text (can include HTML)

  // Location context
  locationId: string;
  presentCharacters: string[];
  availableObjects: string[];

  // All possible interactions (filtered by conditions at runtime)
  interactions: Interaction[];

  // Auto-applied when entering this node
  onEnter: Effect[];

  // Metadata
  canonicalPath: boolean;
  divergenceLevel: number; // 0 = follows original book
  mood: Mood;
  chapterRef?: string; // Reference to source chapter
  chapterNumber?: number;
  chapterTitle?: string;
}

// =============================================================================
// LOCATIONS
// =============================================================================

export type Atmosphere = 'peaceful' | 'tense' | 'mysterious' | 'dangerous' | 'cozy' | 'grand';

export interface Exit {
  direction: string; // "north", "upstairs", "through the door"
  targetLocationId: string;
  conditions: Condition[];
  description: string; // "A dark corridor leads north"
}

export interface Location {
  id: string;
  name: string;
  description: string;
  atmosphere: Atmosphere;
  exits: Exit[];
  objectIds: string[]; // Objects in this location
  npcIds: string[]; // Characters present here
}

// =============================================================================
// GAME OBJECTS
// =============================================================================

export interface GameObject {
  id: string;
  name: string;
  description: string;
  canTake: boolean;
  states?: string[]; // Possible states: ["locked", "unlocked", "broken"]
  initialState?: string;
  interactions: Interaction[]; // Object-specific actions
}

// =============================================================================
// CHARACTERS
// =============================================================================

export interface Character {
  id: string;
  name: string;
  description: string;
  dialogue: DialogueTopic[];
  initialRelation: number; // Starting relationship value
}

export interface DialogueTopic {
  id: string;
  keyword: string; // "treasure", "village", "quest"
  response: string;
  conditions: Condition[];
  effects: Effect[];
}

// =============================================================================
// ITEMS
// =============================================================================

export interface Item {
  id: string;
  name: string;
  description: string;
  useText?: string; // Text shown when used
  combinable?: boolean;
  combinesWith?: string[]; // Other item IDs this can combine with
}

// =============================================================================
// COMPLETE GAME DATA
// =============================================================================

export interface GameData {
  // Metadata
  meta: {
    title: string;
    author: string;
    bookTitle?: string;
    bookAuthor?: string;
    description: string;
    version: string;
    generatedAt: string;
    engineVersion: string;
  };

  // Initial state
  initialState: {
    startNodeId: string;
    startLocationId: string;
    initialInventory: string[];
    initialFlags: Record<string, boolean>;
    initialVariables: Record<string, number>;
  };

  // World data
  nodes: Record<string, StoryNode>;
  locations: Record<string, Location>;
  objects: Record<string, GameObject>;
  characters: Record<string, Character>;
  items: Record<string, Item>;

  // Variable definitions (for UI display)
  variableDefinitions?: Record<
    string,
    {
      displayName: string;
      min?: number;
      max?: number;
      showInUI: boolean;
    }
  >;
}

// =============================================================================
// SAVE DATA
// =============================================================================

export interface GameSave {
  id: string;
  saveName: string;
  gameId: string; // To verify save matches game
  createdAt: string;
  updatedAt: string;

  // Game state snapshot
  state: GameState;

  // For undo feature
  history: HistoryEntry[];
}

export interface HistoryEntry {
  nodeId: string;
  interactionId: string | null;
  timestamp: string;
  stateSnapshot: GameState;
}
