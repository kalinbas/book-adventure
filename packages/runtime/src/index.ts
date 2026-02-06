/**
 * Book Adventure Runtime
 *
 * A minimal game engine for playing text adventures in the browser.
 * This module is designed to be bundled into a single IIFE file for embedding
 * in standalone HTML game exports.
 */

// Export engine
export { BookAdventureEngine } from './engine';
export type { GameEvent, GameEventType, GameEventListener } from './engine';

// Export renderer
export { BookAdventureRenderer } from './ui/renderer';

// Export translations
export { getUIStrings } from './ui/translations';
export type { UIStrings } from './ui/translations';

// Export types
export * from './types';

// Export utility functions
export { evaluateCondition, evaluateConditions } from './engine/conditions';
export { applyEffect, applyEffects, cloneState } from './engine/effects';
export {
  createInitialState,
  saveGame,
  loadSave,
  listSaves,
  deleteSave,
  autoSave,
  loadAutoSave,
} from './engine/state';
