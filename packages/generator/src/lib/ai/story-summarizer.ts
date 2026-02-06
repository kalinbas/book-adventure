import { callWithStructuredOutput } from './client';
import type { ParsedBook } from '../../types';

/**
 * Comprehensive story summary for game generation
 */
export interface StorySummary {
  /** 2-3 paragraph overall summary of the book */
  overview: string;

  /** Key story beats in chronological order */
  plotProgression: {
    beatNumber: number;
    beat: string;
    characters: string[];
    location: string;
    significance: string;
    isDecisionPoint: boolean;
  }[];

  /** Main characters with their arcs */
  characters: {
    id: string;
    name: string;
    role: 'protagonist' | 'antagonist' | 'supporting' | 'minor';
    description: string;
    arc: string;
    relationships: { characterId: string; relationship: string }[];
  }[];

  /** Key locations in the story */
  locations: {
    id: string;
    name: string;
    description: string;
    atmosphere: 'peaceful' | 'tense' | 'mysterious' | 'dangerous' | 'cozy' | 'grand';
    connectedLocations: string[];
  }[];

  /** Points where player could make meaningful different choices */
  decisionPoints: {
    description: string;
    originalChoice: string;
    alternatives: string[];
    consequences: string;
  }[];

  /** Important objects/items that could be interacted with */
  significantObjects: {
    id: string;
    name: string;
    description: string;
    significance: string;
    canBeCarried: boolean;
  }[];

  /** Major themes of the book */
  themes: string[];

  /** Interactable objects with multi-step state progressions */
  interactableObjects: {
    id: string;
    name: string;
    description: string;
    location: string;
    states: string[];
    initialState: string;
    stateTransitions: { from: string; to: string; trigger: string }[];
  }[];

  /** Variables for tracking numeric progression */
  trackableVariables: {
    id: string;
    displayName: string;
    description: string;
    showInUI: boolean;
    relevantScenes: string[];
  }[];
}

/**
 * Create a comprehensive story summary from the entire book
 * This summary is then used to generate the complete game structure
 */
export async function summarizeStory(
  book: ParsedBook,
  apiKey: string,
  onProgress: (percent: number) => void,
  targetNodes: number = 44,
): Promise<StorySummary> {
  onProgress(10);

  // Combine all chapter content
  const fullText = book.chapters
    .map((ch) => `--- Chapter ${ch.number}: ${ch.title} ---\n${ch.content}`)
    .join('\n\n');

  // Truncate to fit context window (~100k chars leaves room for prompt and response)
  const maxChars = 100000;
  const text =
    fullText.length > maxChars
      ? fullText.slice(0, maxChars) + '\n\n[Book continues but is truncated for analysis...]'
      : fullText;

  onProgress(20);

  const systemPrompt = `You are a literary analyst creating a comprehensive summary for turning a book into an interactive text adventure game. Your analysis should capture:
1. The complete plot arc with all major events
2. Key decision points where the story could have gone differently
3. All important characters and their relationships
4. All significant locations and how they connect
5. Important objects that players might interact with (both carryable items and large scenery objects)
6. Interactable objects with multi-step state progressions (e.g., a locked chest: locked→picked→open)
7. Trackable variables that represent player skills, knowledge, or resources
8. The themes that should be reflected in the game

Be thorough - this summary will be the ONLY input for generating the entire game.`;

  const userPrompt = `Analyze this complete book and create a detailed summary suitable for generating an interactive text adventure game.

Book Title: ${book.title}
Author: ${book.author}
Total Chapters: ${book.chapters.length}

FULL TEXT:
${text}

Create a comprehensive JSON summary with this structure:
\`\`\`json
{
  "overview": "2-3 paragraph summary of the entire story",
  "plotProgression": [
    {
      "beatNumber": 1,
      "beat": "Description of what happens",
      "characters": ["character_id"],
      "location": "location_id",
      "significance": "Why this matters to the story",
      "isDecisionPoint": true/false
    }
  ],
  "characters": [
    {
      "id": "snake_case_id",
      "name": "Full Name",
      "role": "protagonist|antagonist|supporting|minor",
      "description": "Physical and personality description",
      "arc": "How the character changes through the story",
      "relationships": [{"characterId": "other_id", "relationship": "description"}]
    }
  ],
  "locations": [
    {
      "id": "snake_case_id",
      "name": "Location Name",
      "description": "Description of the place",
      "atmosphere": "peaceful|tense|mysterious|dangerous|cozy|grand",
      "connectedLocations": ["other_location_id"]
    }
  ],
  "decisionPoints": [
    {
      "description": "The situation where a choice is made",
      "originalChoice": "What the protagonist actually chose",
      "alternatives": ["What they could have chosen instead"],
      "consequences": "What would happen differently"
    }
  ],
  "significantObjects": [
    {
      "id": "snake_case_id",
      "name": "Object Name",
      "description": "What the object is",
      "significance": "Why it matters to the story",
      "canBeCarried": true/false
    }
  ],
  "interactableObjects": [
    {
      "id": "snake_case_id",
      "name": "Object Name",
      "description": "A large interactive object in the world",
      "location": "location_id where this object exists",
      "states": ["initial_state", "second_state", "final_state"],
      "initialState": "initial_state",
      "stateTransitions": [
        {"from": "initial_state", "to": "second_state", "trigger": "examine or use"},
        {"from": "second_state", "to": "final_state", "trigger": "use with item"}
      ]
    }
  ],
  "trackableVariables": [
    {
      "id": "snake_case_id",
      "displayName": "Display Name",
      "description": "What this variable tracks",
      "showInUI": true,
      "relevantScenes": ["plot beat descriptions where this variable changes"]
    }
  ],
  "themes": ["Theme 1", "Theme 2"]
}
\`\`\`

Requirements:
- Include ${Math.min(25, Math.max(15, Math.floor(targetNodes * 0.5)))} plot beats covering the ENTIRE story arc
- Identify ${Math.min(15, Math.max(5, Math.floor(targetNodes * 0.2)))} decision points where player choices would be meaningful
- List ALL important characters (aim for 8-12)
- List ALL significant locations (aim for 10-18)
- List 12-18 significant objects (mix of carryable items and scenery)
- List 3-5 interactable objects with 2-3 states each (e.g., a door: locked→unlocked→open, a painting: covered→revealed→studied)
- List 3-5 trackable variables (skills, knowledge, resources the player builds over time)
- Use snake_case for all IDs
- Make sure location connections are bidirectional

Return ONLY the JSON object, no other text.`;

  onProgress(30);

  const response = await callWithStructuredOutput<StorySummary>(
    apiKey,
    systemPrompt,
    userPrompt,
    {},
    'sonnet'
  );

  onProgress(100);

  return response.data;
}
