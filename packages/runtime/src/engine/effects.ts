import type { Effect, GameState } from '../types';

/**
 * Applies a single effect to the game state (mutates state)
 * Returns the target node ID if a navigation effect was triggered
 */
export function applyEffect(effect: Effect, state: GameState): string | null {
  const { type, key, value, delta } = effect;

  switch (type) {
    // Inventory effects
    case 'add_item':
      if (!state.inventory.includes(key)) {
        state.inventory.push(key);
      }
      break;

    case 'remove_item':
      state.inventory = state.inventory.filter((item) => item !== key);
      break;

    // Flag effects
    case 'set_flag':
      state.flags[key] = true;
      break;

    case 'clear_flag':
      state.flags[key] = false;
      break;

    // Object state effects
    case 'set_object_state':
      state.objectStates[key] = value as string;
      break;

    // Variable effects
    case 'set_variable':
      state.variables[key] = value as number;
      break;

    case 'change_variable':
      state.variables[key] = (state.variables[key] ?? 0) + (delta ?? 0);
      break;

    // Relationship effects
    case 'change_relation':
      const currentRelation = state.characterRelations[key] ?? 0;
      const newRelation = currentRelation + (delta ?? 0);
      // Clamp to -100 to 100 range
      state.characterRelations[key] = Math.max(-100, Math.min(100, newRelation));
      break;

    // Navigation effects
    case 'go_to_node':
      return key; // Return target node ID

    case 'set_location':
      state.currentLocationId = key;
      if (!state.visitedLocations.includes(key)) {
        state.visitedLocations.push(key);
      }
      break;

    default:
      console.warn(`Unknown effect type: ${type}`);
  }

  return null;
}

/**
 * Applies multiple effects in order
 * Returns the target node ID if any navigation effect was triggered
 */
export function applyEffects(effects: Effect[], state: GameState): string | null {
  let targetNodeId: string | null = null;

  for (const effect of effects) {
    const result = applyEffect(effect, state);
    if (result !== null) {
      targetNodeId = result;
    }
  }

  return targetNodeId;
}

/**
 * Creates a deep clone of the game state for history tracking
 */
export function cloneState(state: GameState): GameState {
  return {
    currentNodeId: state.currentNodeId,
    currentLocationId: state.currentLocationId,
    inventory: [...state.inventory],
    objectStates: { ...state.objectStates },
    flags: { ...state.flags },
    variables: { ...state.variables },
    characterRelations: { ...state.characterRelations },
    executedInteractions: [...(state.executedInteractions ?? [])],
    visitedNodes: [...state.visitedNodes],
    visitedLocations: [...state.visitedLocations],
  };
}
