/**
 * Shared engine feature reference — included in every AI prompt
 * to ensure generated games use all available engine features.
 */

export const INTERACTION_TYPES = [
  'examine', 'take', 'use', 'use_on', 'combine', 'talk', 'ask', 'give', 'go', 'story',
] as const;

export const CONDITION_TYPES = [
  'has_item', 'lacks_item', 'flag_true', 'flag_false',
  'object_state', 'object_state_not',
  'visited_node', 'not_visited_node', 'visited_location',
  'variable_eq', 'variable_gte', 'variable_lte', 'variable_gt', 'variable_lt',
  'relation_gte', 'relation_lte', 'in_location',
] as const;

export const EFFECT_TYPES = [
  'add_item', 'remove_item', 'set_flag', 'clear_flag',
  'set_object_state', 'set_variable', 'change_variable',
  'change_relation', 'go_to_node', 'set_location',
] as const;

export const NODE_TYPES = ['narrative', 'choice', 'ending', 'checkpoint'] as const;

export const MOODS = ['neutral', 'tense', 'joyful', 'mysterious', 'action', 'romantic', 'sad'] as const;

/** Minimum quotas for each interaction type in a full game */
export const INTERACTION_QUOTAS: Record<string, number> = {
  examine: 15,
  take: 8,
  use: 6,
  use_on: 2,
  combine: 2,
  talk: 12,
  ask: 3,
  give: 2,
  go: 30,
  story: 20,
};

/**
 * Full engine reference text for inclusion in AI prompts.
 * Describes all interaction types, condition types, and effect types
 * with usage guidance for each.
 */
export const ENGINE_REFERENCE = `
## ENGINE FEATURES REFERENCE

### Node Types (use ONLY these)
- narrative: Standard story scene with exploration and interactions
- choice: Major decision point with 2+ branches leading to different nodes
- ending: Game over node (good, bad, or neutral). Has 0 interactions.
- checkpoint: Act transition / save point

### Interaction Types (ALL 10 must appear in the game)
- examine: Look at/investigate something. No navigation. Shows descriptive text.
- take: Pick up an item. Use lacks_item condition + add_item effect.
- use: Use an item from inventory. Use has_item condition.
- use_on: Use an item ON an object or character. Set requiresItem field + has_item condition + targetObject field.
- combine: Combine two inventory items into a new item. Use requiresItem for one item + has_item conditions for BOTH items + remove_item effects for BOTH + add_item for the result.
- talk: Talk to a character. Often includes change_relation effect.
- ask: Ask a character about a specific topic. More targeted than talk.
- give: Give an item to a character. Set requiresItem field + has_item condition + remove_item + change_relation effects.
- go: Navigate to another node. MUST have targetNodeId AND set_location effect.
- story: Major narrative choice. Often has targetNodeId for branching to different paths.

### Condition Types (ALL 17 must appear in the game)
- has_item: Player has item in inventory. Key = item_id.
- lacks_item: Player does NOT have item. Key = item_id.
- flag_true: Boolean flag is true. Key = flag_name.
- flag_false: Boolean flag is false. Key = flag_name.
- object_state: Object has a specific state. Key = object_id, value = state string.
- object_state_not: Object does NOT have a specific state. Key = object_id, value = state string.
- visited_node: Player has visited a specific node before. Key = node_id.
- not_visited_node: Player has NOT visited a specific node. Key = node_id.
- visited_location: Player has visited a specific location. Key = location_id.
- variable_eq: Numeric variable equals value. Key = variable_name, value = number.
- variable_gte: Numeric variable >= value. Key = variable_name, value = number.
- variable_lte: Numeric variable <= value. Key = variable_name, value = number.
- variable_gt: Numeric variable > value. Key = variable_name, value = number.
- variable_lt: Numeric variable < value. Key = variable_name, value = number.
- relation_gte: Character relationship >= value. Key = character_id, value = number (-100 to 100).
- relation_lte: Character relationship <= value. Key = character_id, value = number (-100 to 100).
- in_location: Player is in a specific location. Key = location_id.

### Effect Types (ALL 10 must appear in the game)
- add_item: Add item to inventory. Key = item_id.
- remove_item: Remove item from inventory. Key = item_id.
- set_flag: Set boolean flag to true. Key = flag_name, value = true.
- clear_flag: Set boolean flag to false. Key = flag_name, value = false.
- set_object_state: Change object state. Key = object_id, value = new state string.
- set_variable: Set numeric variable to exact value. Key = variable_name, value = number.
- change_variable: Add delta to numeric variable. Key = variable_name, delta = number (can be negative).
- change_relation: Add delta to character relationship. Key = character_id, delta = number (-100 to 100).
- go_to_node: Navigate to a node via effect (not targetNodeId). Key = node_id.
- set_location: Change current location. Key = location_id.

### Interaction Structure
\`\`\`json
{
  "id": "unique_interaction_id",
  "type": "examine|take|use|use_on|combine|talk|ask|give|go|story",
  "buttonText": "What the player sees on the button",
  "resultText": "What happens when clicked (2nd person, 1-3 sentences)",
  "targetObject": "object_or_character_id (for use_on, give, talk, ask, examine)",
  "requiresItem": "item_id (for use_on, give)",
  "conditions": [{"type": "has_item", "key": "item_id"}],
  "effects": [{"type": "add_item", "key": "item_id"}],
  "targetNodeId": "node_id (for go, story — navigates after interaction)"
}
\`\`\`

### Key Rules
1. "go" interactions MUST have both targetNodeId AND a set_location effect
2. "take" interactions should use lacks_item condition (prevent duplicates) + add_item effect
3. "give" interactions should use has_item condition + remove_item effect + change_relation effect
4. "use_on" interactions need both requiresItem and targetObject fields
5. "combine" interactions need requiresItem for one item, has_item conditions for both items, remove_item effects for both, and add_item for the result item
6. At least 50% of interactions should have conditions
7. At least 50% of interactions should have effects
8. Ending nodes have 0 interactions
9. Non-ending nodes MUST have at least 5 interactions (target 6-8)
10. "conditions", "effects", and "onEnter" fields MUST ALWAYS be arrays, even when empty — use [], NEVER omit or set to undefined/null
11. All entity references (item IDs, object IDs, character IDs, location IDs, variable names, node IDs) must be valid IDs provided in the world data — do NOT invent IDs
`.trim();

/**
 * Build batch-specific feature requirements.
 * Distributes condition/effect types across batches so each batch
 * is responsible for including specific types.
 */
export function getBatchFeatureRequirements(
  batchIndex: number,
  totalBatches: number,
): { requiredConditions: string[]; requiredEffects: string[]; requiredInteractions: string[] } {
  const phase = batchIndex / totalBatches;

  if (phase < 0.2) {
    // Early game
    return {
      requiredConditions: ['has_item', 'lacks_item', 'flag_true', 'flag_false'],
      requiredEffects: ['add_item', 'set_flag', 'set_location'],
      requiredInteractions: ['examine', 'take', 'go', 'story'],
    };
  } else if (phase < 0.4) {
    // Exploration
    return {
      requiredConditions: ['object_state', 'object_state_not', 'visited_location'],
      requiredEffects: ['set_object_state', 'change_variable'],
      requiredInteractions: ['examine', 'use', 'talk', 'go'],
    };
  } else if (phase < 0.6) {
    // Mid game
    return {
      requiredConditions: ['variable_gte', 'variable_lte', 'relation_gte'],
      requiredEffects: ['change_relation', 'remove_item'],
      requiredInteractions: ['talk', 'ask', 'give', 'combine', 'story'],
    };
  } else if (phase < 0.8) {
    // Late game
    return {
      requiredConditions: ['visited_node', 'not_visited_node', 'variable_gt', 'variable_lt', 'relation_lte'],
      requiredEffects: ['clear_flag'],
      requiredInteractions: ['use_on', 'ask', 'story'],
    };
  } else {
    // Climax/endings
    return {
      requiredConditions: ['variable_eq', 'in_location'],
      requiredEffects: ['go_to_node', 'set_variable'],
      requiredInteractions: ['story', 'examine', 'go'],
    };
  }
}
