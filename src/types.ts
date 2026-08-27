export type AppTab = 'home' | 'map' | 'chat';
export type HomePhase = 'crisis' | 'no-crisis' | 'refreshing' | 'updated';
export type LayerKey = 'myLocation' | 'wildfire' | 'evacWarning' | 'evacOrder';
export type SheetKey = 'wildfire' | 'evacWarning' | 'evacOrder' | null;
export type StatusLevel = 'CLEAR' | 'AWARE' | 'PREPARE' | 'ACT' | 'RECOVER';
export type ChatMessage = {
  id: number;
  role: 'user' | 'assistant';
  text: string;
  source?: string;
};
