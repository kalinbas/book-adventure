import type { Condition, GameState } from '../types';

/**
 * Evaluates a single condition against the current game state
 */
export function evaluateCondition(condition: Condition, state: GameState): boolean {
  const { type, key, value } = condition;

  switch (type) {
    // Inventory conditions
    case 'has_item':
      return state.inventory.includes(key);

    case 'lacks_item':
      return !state.inventory.includes(key);

    // Flag conditions
    case 'flag_true':
      return state.flags[key] === true;

    case 'flag_false':
      return state.flags[key] !== true;

    // Object state conditions
    case 'object_state':
      return state.objectStates[key] === value;

    case 'object_state_not':
      return state.objectStates[key] !== value;

    // Visit history conditions
    case 'visited_node':
      return state.visitedNodes.includes(key);

    case 'not_visited_node':
      return !state.visitedNodes.includes(key);

    case 'visited_location':
      return state.visitedLocations.includes(key);

    // Variable conditions
    case 'variable_eq':
      return (state.variables[key] ?? 0) === value;

    case 'variable_gte':
      return (state.variables[key] ?? 0) >= (value as number);

    case 'variable_lte':
      return (state.variables[key] ?? 0) <= (value as number);

    case 'variable_gt':
      return (state.variables[key] ?? 0) > (value as number);

    case 'variable_lt':
      return (state.variables[key] ?? 0) < (value as number);

    // Relationship conditions
    case 'relation_gte':
      return (state.characterRelations[key] ?? 0) >= (value as number);

    case 'relation_lte':
      return (state.characterRelations[key] ?? 0) <= (value as number);

    // Location condition
    case 'in_location':
      return state.currentLocationId === key;

    default:
      console.warn(`Unknown condition type: ${type}`);
      return false;
  }
}

/**
 * Evaluates all conditions - all must be true for the result to be true
 */
export function evaluateConditions(conditions: Condition[], state: GameState): boolean {
  if (conditions.length === 0) return true;
  return conditions.every((condition) => evaluateCondition(condition, state));
}
