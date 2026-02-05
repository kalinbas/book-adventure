import type { GameData, GameState, GameSave, HistoryEntry } from '../types';
import { cloneState } from './effects';

const SAVE_PREFIX = 'book_adventure_save_';
const MAX_HISTORY = 50;

/**
 * Creates the initial game state from game data
 */
export function createInitialState(gameData: GameData): GameState {
  const { initialState, characters } = gameData;

  // Initialize character relations from character definitions
  const characterRelations: Record<string, number> = {};
  for (const [id, char] of Object.entries(characters)) {
    characterRelations[id] = char.initialRelation ?? 0;
  }

  return {
    currentNodeId: initialState.startNodeId,
    currentLocationId: initialState.startLocationId,
    inventory: [...initialState.initialInventory],
    objectStates: {},
    flags: { ...initialState.initialFlags },
    variables: { ...initialState.initialVariables },
    characterRelations,
    executedInteractions: [],
    visitedNodes: [initialState.startNodeId],
    visitedLocations: [initialState.startLocationId],
  };
}

/**
 * Gets the storage key for a save
 */
function getSaveKey(gameId: string, saveId: string): string {
  return `${SAVE_PREFIX}${gameId}_${saveId}`;
}

/**
 * Lists all saves for a game
 */
export function listSaves(gameId: string): GameSave[] {
  const saves: GameSave[] = [];
  const prefix = `${SAVE_PREFIX}${gameId}_`;

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(prefix)) {
      try {
        const data = localStorage.getItem(key);
        if (data) {
          saves.push(JSON.parse(data));
        }
      } catch (e) {
        console.warn(`Failed to parse save: ${key}`);
      }
    }
  }

  // Sort by updated time, most recent first
  return saves.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

/**
 * Saves the current game state
 */
export function saveGame(
  gameId: string,
  state: GameState,
  history: HistoryEntry[],
  saveName: string,
  existingSaveId?: string
): GameSave {
  const now = new Date().toISOString();
  const saveId = existingSaveId ?? `save_${Date.now()}`;

  const save: GameSave = {
    id: saveId,
    saveName,
    gameId,
    createdAt: existingSaveId ? listSaves(gameId).find((s) => s.id === saveId)?.createdAt ?? now : now,
    updatedAt: now,
    state: cloneState(state),
    history: history.slice(-MAX_HISTORY), // Keep only recent history
  };

  const key = getSaveKey(gameId, saveId);
  localStorage.setItem(key, JSON.stringify(save));

  return save;
}

/**
 * Loads a saved game
 */
export function loadSave(gameId: string, saveId: string): GameSave | null {
  const key = getSaveKey(gameId, saveId);
  const data = localStorage.getItem(key);

  if (!data) return null;

  try {
    const save = JSON.parse(data) as GameSave;
    if (save.gameId !== gameId) {
      console.warn('Save game ID mismatch');
      return null;
    }
    return save;
  } catch (e) {
    console.error('Failed to load save:', e);
    return null;
  }
}

/**
 * Deletes a save
 */
export function deleteSave(gameId: string, saveId: string): void {
  const key = getSaveKey(gameId, saveId);
  localStorage.removeItem(key);
}

/**
 * Auto-save functionality
 */
export function autoSave(gameId: string, state: GameState, history: HistoryEntry[]): void {
  saveGame(gameId, state, history, 'Auto Save', 'autosave');
}

/**
 * Load auto-save if it exists
 */
export function loadAutoSave(gameId: string): GameSave | null {
  return loadSave(gameId, 'autosave');
}
