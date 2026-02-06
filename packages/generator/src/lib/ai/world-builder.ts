/**
 * Step 2: World Building
 *
 * Generates all world entities (locations, characters, items, objects, variables)
 * from the story summary. Uses AI to produce richer entities than simple mapping.
 */

import { callWithStructuredOutput } from './client';
import type { StorySummary } from './story-summarizer';
import { ENGINE_REFERENCE } from './engine-reference';

export interface WorldData {
  locations: Record<string, any>;
  characters: Record<string, any>;
  items: Record<string, any>;
  objects: Record<string, any>;
  variableDefinitions: Record<string, any>;
  initialState: {
    startLocationId: string;
    initialInventory: string[];
    initialFlags: Record<string, boolean>;
    initialVariables: Record<string, number>;
  };
}

export async function buildWorld(
  summary: StorySummary,
  apiKey: string,
  targetNodes: number = 44,
  onProgress?: (percent: number) => void,
): Promise<WorldData> {
  onProgress?.(10);

  const locationCount = Math.min(50, Math.max(15, Math.floor(targetNodes * 0.4)));
  const characterCount = Math.min(30, Math.max(8, Math.floor(targetNodes * 0.25)));
  const itemCount = Math.min(60, Math.max(14, Math.floor(targetNodes * 0.35)));

  const systemPrompt = `You are a game world designer creating all entities for an interactive text adventure game.
You must create richly detailed world entities that support complex gameplay mechanics.

${ENGINE_REFERENCE}

Output valid JSON only. No explanations.`;

  const userPrompt = `Create the complete game world for a text adventure based on this story:

## STORY OVERVIEW
${summary.overview}

## CHARACTERS FROM ANALYSIS
${summary.characters.map((c) => `- ${c.id}: ${c.name} (${c.role}) — ${c.description}`).join('\n')}

## LOCATIONS FROM ANALYSIS
${summary.locations.map((l) => `- ${l.id}: ${l.name} (${l.atmosphere}) — ${l.description}`).join('\n')}

## OBJECTS (carryable items)
${summary.significantObjects.filter((o) => o.canBeCarried).map((o) => `- ${o.id}: ${o.name} — ${o.description}`).join('\n')}

## INTERACTABLE OBJECTS (with state machines)
${(summary.interactableObjects ?? []).map((o) => `- ${o.id}: ${o.name} at ${o.location}, states: ${o.states.join('→')}`).join('\n') || 'Generate 3-5 interactable objects with 2-3 states each'}

## TRACKABLE VARIABLES
${(summary.trackableVariables ?? []).map((v) => `- ${v.id}: ${v.displayName} — ${v.description}`).join('\n') || 'Generate 3-5 trackable variables (skills, resources, knowledge)'}

## REQUIREMENTS

### Locations (${locationCount})
- Include all locations from the analysis plus additional ones if needed
- Each location must have: id, name, description, atmosphere, exits (bidirectional), objectIds, npcIds
- Atmosphere: "peaceful"|"tense"|"mysterious"|"dangerous"|"cozy"|"grand"
- Exits must have: direction, targetLocationId, conditions (usually empty), description

### Characters (${characterCount})
- Include all characters from the analysis
- Each must have: id, name, description, initialRelation (number -100 to 100), dialogue (2-4 topics)
- Each dialogue topic: id, keyword, response, conditions (array), effects (array)
- At least 2 characters should have dialogue gated by relation_gte conditions
- Protagonist allies start with positive initialRelation (10-30), antagonists with negative (-10 to -30)

### Items (${itemCount})
- All carryable objects from the analysis become items
- Each must have: id, name, description, useText (optional)
- At least 2-3 items should have combinable: true and combinesWith referencing other item IDs

### Objects (3-5 with state machines)
- Non-carryable interactable objects in the world
- Each must have: id, name, description, canTake: false, states (array of 2-3 strings), initialState, interactions (1-2)
- Object interactions should use set_object_state effects

### Variable Definitions (3-5)
- Numeric variables tracked during gameplay
- Each must have: displayName, min (0), max (100), showInUI: true
- Examples: skills, knowledge areas, resources, reputation

### Initial State
- startLocationId: the first location
- initialInventory: [] (empty)
- initialFlags: {} (empty)
- initialVariables: object mapping variable IDs to starting values (usually 0)

## OUTPUT FORMAT
Return a JSON object:
\`\`\`json
{
  "locations": { "loc_id": { ... } },
  "characters": { "char_id": { ... } },
  "items": { "item_id": { ... } },
  "objects": { "obj_id": { ... } },
  "variableDefinitions": { "var_id": { "displayName": "...", "min": 0, "max": 100, "showInUI": true } },
  "initialState": { "startLocationId": "...", "initialInventory": [], "initialFlags": {}, "initialVariables": { "var_id": 0 } }
}
\`\`\`

Return ONLY valid JSON.`;

  onProgress?.(30);

  const response = await callWithStructuredOutput<WorldData>(
    apiKey,
    systemPrompt,
    userPrompt,
    {},
    'sonnet',
  );

  onProgress?.(100);
  return response.data;
}
