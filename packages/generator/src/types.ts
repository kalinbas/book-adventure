/**
 * Shared type definitions for the Book Adventure generator
 */

export interface Chapter {
  id: string;
  number: number;
  title: string;
  content: string;
  startPage: number;
  endPage: number;
}

export interface ParsedBook {
  title: string;
  author: string;
  chapters: Chapter[];
  metadata: {
    totalPages: number;
    wordCount: number;
    extractedAt: string;
  };
}

export interface Character {
  id: string;
  name: string;
  aliases: string[];
  description: string;
  role: string;
  traits: string[];
  motivations: string[];
  firstAppearance: string;
}

export interface Location {
  id: string;
  name: string;
  description: string;
  atmosphere: string;
  connectedLocations: string[];
}

export interface PlotPoint {
  id: string;
  chapterId: string;
  type: 'exposition' | 'rising_action' | 'climax' | 'falling_action' | 'resolution';
  summary: string;
  involvedCharacters: string[];
  location: string;
  isKeyDecisionPoint: boolean;
}

export interface NarrativeAnalysis {
  characters: Character[];
  locations: Location[];
  plotPoints: PlotPoint[];
  themes: string[];
}
