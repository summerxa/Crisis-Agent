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

export type LocationAccessState = 'checking' | 'granted' | 'denied' | 'error';

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
  previousSnapshot: CrisisSnapshot | null;
  loading: boolean;
  locationError: string | null;
  locationAccess: LocationAccessState;
  refresh: () => Promise<void>;
  todoListAgent: TodoListAgentState;
};

export type TodoListAgentActionItem = {
  emoji: string;
  short_description: string;
  long_description: string;
  citation: string[];
};

export type TodoListAgentResponse = {
  state: StatusLevel;
  subtitle: string;
  description: string;
  change_items: string[];
  action_items: TodoListAgentActionItem[];
  disaster_state_writeup: string;
  disaster_response_writeup: string;
};

export type TodoListAgentRequest = {
  sessionId: string;
  crisisSnapshot: CrisisSnapshot;
  previousSnapshot?: CrisisSnapshot | null;
};

export type TodoListAgentState = {
  data: TodoListAgentResponse | null;
  loading: boolean;
  error: string | null;
  success: boolean;
  getTodoListAgentResponse: (params: TodoListAgentRequest) => Promise<TodoListAgentResponse>;
};

export type ChatAgentResponse = {
  citations: string[];
  answer: string;
  follow_up_questions: string[];
};

export type ChatAgentRequest = {
  sessionId: string;
  prompt: string;
  disasterSnapshot: CrisisSnapshot;
  previousSnapshot?: CrisisSnapshot | null;
  disasterWriteup: string;
  todoWriteup: string;
};
