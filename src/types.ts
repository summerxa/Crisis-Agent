export type AppTab = 'home' | 'map' | 'chat';
export type HomePhase = 'crisis' | 'no-crisis' | 'refreshing' | 'updated';
export type LayerKey =
  | 'myLocation'
  | 'weatherAlerts'
  | 'wildfires'
  | 'evacWarning'
  | 'evacOrder';
export type SheetKey = string | null;
export type StatusLevel = 'CLEAR' | 'AWARE' | 'PREPARE' | 'ACT' | 'RECOVER';
export type ChatMessage = {
  id: number;
  role: 'user' | 'assistant';
  text: string;
  source?: string;
};

export type Position = {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: string;
};

export type GeoPoint = { type: 'Point'; coordinates: [number, number] };
export type GeoPolygon = {
  type: 'Polygon';
  coordinates: [number, number][][];
};
export type GeoMultiPolygon = {
  type: 'MultiPolygon';
  coordinates: [number, number][][][];
};
export type CrisisGeometry = GeoPoint | GeoPolygon | GeoMultiPolygon;

export type CrisisFeature = {
  id: string;
  kind: 'weatherAlert' | 'wildfire' | 'evacWarning' | 'evacOrder';
  geometry: CrisisGeometry;
  title: string;
  status: string;
  severity?: string;
  description?: string;
  sourceName: string;
  sourceUrl: string;
  updatedAt: string;
  expiresAt?: string;
  rawSourceId: string;
};

export type SourceHealth = {
  status: 'ok' | 'error';
  checkedAt: string;
  message?: string;
};

export type CrisisSnapshot = {
  location: Position;
  fetchedAt: string;
  features: CrisisFeature[];
  sourceHealth: Record<'nws' | 'wfigs', SourceHealth>;
  stale: boolean;
};

export type CrisisDataState = {
  snapshot: CrisisSnapshot | null;
  loading: boolean;
  locationError: string | null;
  refresh: () => Promise<void>;
};

export type TodoListAgentActionItem = {
  emoji: string;
  shortDescription: string;
  longDescription: string;
  citation: string[];
};

export type TodoListAgentResponse = {
  state: StatusLevel;
  subtitle: string;
  description: string;
  changeItems: string[];
  actionItems: TodoListAgentActionItem[];
  disasterStateWriteup: string;
  disasterResponseWriteup: string;
};

export type TodoListAgentState = {
  result: TodoListAgentResponse | null;
  loading: boolean;
  error: string | null;
  getTodoListAgentResponse: (
    snapshot: CrisisSnapshot,
    previousSnapshot?: CrisisSnapshot,
  ) => Promise<TodoListAgentResponse>;
  reset: () => void;
};

export type ChatAgentResponse = {
  citations: string[];
  answer: string;
  followUpQuestions: string[];
};

export type ChatAgentState = {
  result: ChatAgentResponse | null;
  loading: boolean;
  error: string | null;
  getChatAgentResponse: (
    prompt: string,
    snapshot: CrisisSnapshot,
    disasterWriteup: string,
    todoWriteup: string,
    previousSnapshot?: CrisisSnapshot,
  ) => Promise<ChatAgentResponse>;
  reset: () => void;
};
