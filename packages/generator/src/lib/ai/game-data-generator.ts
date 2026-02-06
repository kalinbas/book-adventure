/**
 * Game Data Type Definitions
 *
 * Defines the GameData structure and all related types used by the
 * game engine runtime. These types are used throughout the generator pipeline.
 */

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
    language: string;
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

export interface StoryNode {
  id: string;
  type: 'narrative' | 'choice' | 'ending' | 'checkpoint';
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

export interface Interaction {
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

export interface Condition {
  type: string;
  key: string;
  value?: string | number | boolean;
}

export interface Effect {
  type: string;
  key: string;
  value?: string | number | boolean;
  delta?: number;
}

export interface GameLocation {
  id: string;
  name: string;
  description: string;
  atmosphere: string;
  exits: Exit[];
  objectIds: string[];
  npcIds: string[];
}

export interface Exit {
  direction: string;
  targetLocationId: string;
  conditions: Condition[];
  description: string;
}

export interface GameObject {
  id: string;
  name: string;
  description: string;
  canTake: boolean;
  states?: string[];
  initialState?: string;
  interactions: Interaction[];
}

export interface GameCharacter {
  id: string;
  name: string;
  description: string;
  dialogue: DialogueTopic[];
  initialRelation: number;
}

export interface DialogueTopic {
  id: string;
  keyword: string;
  response: string;
  conditions: Condition[];
  effects: Effect[];
}

export interface Item {
  id: string;
  name: string;
  description: string;
  useText?: string;
  combinable?: boolean;
  combinesWith?: string[];
}

export interface VariableDefinition {
  displayName: string;
  min?: number;
  max?: number;
  showInUI: boolean;
}
