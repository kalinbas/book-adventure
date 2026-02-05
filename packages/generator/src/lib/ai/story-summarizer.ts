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
}

/**
 * Create a comprehensive story summary from the entire book
 * This summary is then used to generate the complete game structure
 */
export async function summarizeStory(
  book: ParsedBook,
  apiKey: string,
  onProgress: (percent: number) => void
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
5. Important objects that players might interact with
6. The themes that should be reflected in the game

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
  "themes": ["Theme 1", "Theme 2"]
}
\`\`\`

Requirements:
- Include 15-25 plot beats covering the ENTIRE story arc
- Identify 5-10 decision points where player choices would be meaningful
- List ALL important characters (aim for 5-15)
- List ALL significant locations (aim for 5-15)
- List 5-10 important objects
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
