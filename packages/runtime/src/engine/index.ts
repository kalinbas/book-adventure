import type {
  GameData,
  GameState,
  GameSave,
  StoryNode,
  Interaction,
  HistoryEntry,
  Item,
  Location,
} from '../types';
import { evaluateConditions } from './conditions';
import { applyEffects, cloneState } from './effects';
import {
  createInitialState,
  saveGame,
  loadSave,
  listSaves,
  deleteSave,
  autoSave,
  loadAutoSave,
} from './state';

export type GameEventType =
  | 'node_changed'
  | 'state_changed'
  | 'interaction_result'
  | 'game_started'
  | 'game_loaded'
  | 'game_saved'
  | 'game_ended';

export interface GameEvent {
  type: GameEventType;
  node?: StoryNode;
  interaction?: Interaction;
  resultText?: string;
  state?: GameState;
  save?: GameSave;
}

export type GameEventListener = (event: GameEvent) => void;

/**
 * Book Adventure Game Engine
 * Manages game state, evaluates conditions, applies effects, and handles navigation
 */
export class BookAdventureEngine {
  private gameData: GameData;
  private state: GameState;
  private history: HistoryEntry[] = [];
  private listeners: Set<GameEventListener> = new Set();
  private gameId: string;
  private autoSaveEnabled = true;
  private autoSaveInterval = 60000; // 1 minute
  private autoSaveTimer: number | null = null;

  constructor(gameData: GameData) {
    this.gameData = gameData;
    this.gameId = this.generateGameId();
    this.state = createInitialState(gameData);
  }

  /**
   * Generates a unique game ID based on game metadata
   */
  private generateGameId(): string {
    const { title, version } = this.gameData.meta;
    return `${title.replace(/\s+/g, '_').toLowerCase()}_${version}`;
  }

  /**
   * Subscribe to game events
   */
  on(listener: GameEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Emit an event to all listeners
   */
  private emit(event: GameEvent): void {
    this.listeners.forEach((listener) => listener(event));
  }

  /**
   * Start the game (or restart from beginning)
   */
  start(): void {
    this.state = createInitialState(this.gameData);
    this.history = [];

    // Apply onEnter effects for the starting node
    const startNode = this.getCurrentNode();
    if (startNode?.onEnter.length) {
      applyEffects(startNode.onEnter, this.state);
    }

    this.emit({ type: 'game_started', node: startNode ?? undefined, state: this.state });
    this.startAutoSave();
  }

  /**
   * Start auto-save timer
   */
  private startAutoSave(): void {
    if (this.autoSaveEnabled && !this.autoSaveTimer) {
      this.autoSaveTimer = window.setInterval(() => {
        autoSave(this.gameId, this.state, this.history);
      }, this.autoSaveInterval);
    }
  }

  /**
   * Stop auto-save timer
   */
  private stopAutoSave(): void {
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
      this.autoSaveTimer = null;
    }
  }

  /**
   * Get the current story node
   */
  getCurrentNode(): StoryNode | null {
    return this.gameData.nodes[this.state.currentNodeId] ?? null;
  }

  /**
   * Get the current location
   */
  getCurrentLocation(): Location | null {
    return this.gameData.locations[this.state.currentLocationId] ?? null;
  }

  /**
   * Get the current game state (read-only)
   */
  getState(): Readonly<GameState> {
    return this.state;
  }

  /**
   * Get game metadata
   */
  getMeta(): GameData['meta'] {
    return this.gameData.meta;
  }

  /**
   * Get all available interactions for the current node
   * Filters based on current game state conditions
   */
  getAvailableInteractions(): Interaction[] {
    const node = this.getCurrentNode();
    if (!node) return [];

    const executed = this.state.executedInteractions ?? [];

    // Build a set of condition signatures for executed story interactions
    // to identify mutually exclusive choices (same conditions = same choice group)
    const executedStoryConditionKeys = new Set<string>();
    for (const i of node.interactions) {
      if (i.type === 'story' && !i.targetNodeId && executed.includes(i.id)) {
        executedStoryConditionKeys.add(JSON.stringify(i.conditions));
      }
    }

    return node.interactions.filter((interaction) => {
      // Hide interactions that have already been executed
      if (executed.includes(interaction.id)) {
        return false;
      }
      // Hide story interactions that share conditions with an already-chosen one
      // (mutually exclusive choices have identical conditions)
      if (
        interaction.type === 'story' &&
        !interaction.targetNodeId &&
        executedStoryConditionKeys.has(JSON.stringify(interaction.conditions))
      ) {
        return false;
      }
      return evaluateConditions(interaction.conditions, this.state);
    });
  }

  /**
   * Get inventory items with full details
   */
  getInventoryItems(): Item[] {
    return this.state.inventory
      .map((itemId) => this.gameData.items[itemId])
      .filter((item): item is Item => item !== undefined);
  }

  /**
   * Execute an interaction
   */
  executeInteraction(interactionId: string): string | null {
    const node = this.getCurrentNode();
    if (!node) return null;

    const interaction = node.interactions.find((i) => i.id === interactionId);
    if (!interaction) {
      console.warn(`Interaction not found: ${interactionId}`);
      return null;
    }

    // Verify conditions are still met
    if (!evaluateConditions(interaction.conditions, this.state)) {
      console.warn(`Interaction conditions not met: ${interactionId}`);
      return null;
    }

    // Save history entry before applying effects
    this.history.push({
      nodeId: this.state.currentNodeId,
      interactionId,
      timestamp: new Date().toISOString(),
      stateSnapshot: cloneState(this.state),
    });

    // Apply effects
    let targetNodeId = applyEffects(interaction.effects, this.state);

    // If interaction has explicit target node, use that
    if (interaction.targetNodeId) {
      targetNodeId = interaction.targetNodeId;
    }

    // Emit interaction result
    this.emit({
      type: 'interaction_result',
      interaction,
      resultText: interaction.resultText,
      state: this.state,
    });

    // Navigate to target node if specified
    if (targetNodeId) {
      this.goToNode(targetNodeId);
    } else {
      // Track this interaction as executed on the current node
      if (!this.state.executedInteractions) {
        this.state.executedInteractions = [];
      }
      this.state.executedInteractions.push(interactionId);
      this.emit({ type: 'state_changed', state: this.state });
    }

    return interaction.resultText;
  }

  /**
   * Navigate to a specific node
   */
  goToNode(nodeId: string): void {
    const node = this.gameData.nodes[nodeId];
    if (!node) {
      console.warn(`Node not found: ${nodeId}`);
      return;
    }

    // Update current node
    this.state.currentNodeId = nodeId;

    // Track visited nodes
    if (!this.state.visitedNodes.includes(nodeId)) {
      this.state.visitedNodes.push(nodeId);
    }

    // Update location if node has a different location
    if (node.locationId && node.locationId !== this.state.currentLocationId) {
      this.state.currentLocationId = node.locationId;
      if (!this.state.visitedLocations.includes(node.locationId)) {
        this.state.visitedLocations.push(node.locationId);
      }
    }

    // Apply onEnter effects
    if (node.onEnter.length) {
      applyEffects(node.onEnter, this.state);
    }

    this.emit({ type: 'node_changed', node, state: this.state });

    // Check if this is an ending node
    if (node.type === 'ending') {
      this.emit({ type: 'game_ended', node, state: this.state });
      this.stopAutoSave();
    }
  }

  /**
   * Undo the last action
   */
  undo(): boolean {
    if (this.history.length === 0) return false;

    const lastEntry = this.history.pop()!;
    this.state = cloneState(lastEntry.stateSnapshot);

    const node = this.getCurrentNode();
    this.emit({ type: 'node_changed', node: node ?? undefined, state: this.state });

    return true;
  }

  /**
   * Get history for display
   */
  getHistory(): HistoryEntry[] {
    return [...this.history];
  }

  /**
   * Save the current game
   */
  save(saveName: string, existingSaveId?: string): GameSave {
    const save = saveGame(this.gameId, this.state, this.history, saveName, existingSaveId);
    this.emit({ type: 'game_saved', save, state: this.state });
    return save;
  }

  /**
   * Load a saved game
   */
  load(saveId: string): boolean {
    const save = loadSave(this.gameId, saveId);
    if (!save) return false;

    this.state = cloneState(save.state);
    this.history = [...save.history];

    const node = this.getCurrentNode();
    this.emit({ type: 'game_loaded', node: node ?? undefined, state: this.state, save });
    this.startAutoSave();

    return true;
  }

  /**
   * List all saves for this game
   */
  getSaves(): GameSave[] {
    return listSaves(this.gameId);
  }

  /**
   * Delete a save
   */
  deleteSave(saveId: string): void {
    deleteSave(this.gameId, saveId);
  }

  /**
   * Check if auto-save exists
   */
  hasAutoSave(): boolean {
    return loadAutoSave(this.gameId) !== null;
  }

  /**
   * Load auto-save
   */
  loadAutoSave(): boolean {
    const save = loadAutoSave(this.gameId);
    if (!save) return false;

    this.state = cloneState(save.state);
    this.history = [...save.history];

    const node = this.getCurrentNode();
    this.emit({ type: 'game_loaded', node: node ?? undefined, state: this.state, save });
    this.startAutoSave();

    return true;
  }

  /**
   * Get progress percentage
   */
  getProgress(): number {
    const totalNodes = Object.keys(this.gameData.nodes).length;
    const visitedCount = this.state.visitedNodes.length;
    return Math.round((visitedCount / totalNodes) * 100);
  }

  /**
   * Get current chapter info
   */
  getChapterInfo(): { number: number; title: string; total: number } | null {
    const node = this.getCurrentNode();
    if (!node?.chapterNumber) return null;

    // Count total chapters
    const chapters = new Set<number>();
    for (const n of Object.values(this.gameData.nodes)) {
      if (n.chapterNumber) chapters.add(n.chapterNumber);
    }

    return {
      number: node.chapterNumber,
      title: node.chapterTitle ?? `Chapter ${node.chapterNumber}`,
      total: chapters.size,
    };
  }

  /**
   * Get a specific item by ID
   */
  getItem(itemId: string): Item | null {
    return this.gameData.items[itemId] ?? null;
  }

  /**
   * Get a specific character by ID
   */
  getCharacter(characterId: string): { name: string; relation: number } | null {
    const char = this.gameData.characters[characterId];
    if (!char) return null;

    return {
      name: char.name,
      relation: this.state.characterRelations[characterId] ?? 0,
    };
  }

  /**
   * Get variable display info
   */
  getVariableDisplay(): Array<{ name: string; value: number; displayName: string }> {
    const result: Array<{ name: string; value: number; displayName: string }> = [];
    const defs = this.gameData.variableDefinitions ?? {};

    for (const [key, def] of Object.entries(defs)) {
      if (def.showInUI) {
        result.push({
          name: key,
          value: this.state.variables[key] ?? 0,
          displayName: def.displayName,
        });
      }
    }

    return result;
  }

  /**
   * Cleanup when engine is destroyed
   */
  destroy(): void {
    this.stopAutoSave();
    this.listeners.clear();
  }
}

// Re-export types and utilities
export * from '../types';
export { evaluateCondition, evaluateConditions } from './conditions';
export { applyEffect, applyEffects, cloneState } from './effects';
