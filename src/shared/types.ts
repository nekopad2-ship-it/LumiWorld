export type NpcTier = "major" | "minor" | "stranger" | "extra";

export type EmotionalState = {
  dominant: string;
  secondary?: string;
  intensity: number;
};

export type TimeAdvance = {
  amount: string;
  newDescriptor: string;
};

export type SceneCast = {
  active: string[];
  nearby: string[];
  offscreen: string[];
  cardPrincipal?: string;
  beatFocal?: string;
  beatDriver?: string;
};

export type StateUpdateNpcDelta = {
  id: string;
  moodNow?: string;
  locationNow?: string;
  emotionalStateNow?: EmotionalState;
  agendaNow?: string;
};

export type EdgeDelta = {
  from: string;
  to: string;
  momentary?: Record<string, number>;
  durableChanges?: Record<string, number>;
  qualifyingEvent?: string;
  publicFaceShift?: number;
  boundaryChanges?: Record<string, string>;
};

export type SecretDelta = {
  secret: string;
  lifecycle: string;
  suspects?: string[];
  newEvidence?: string[];
};

export type HookDelta = {
  arc: string;
  fact: string;
  lifecycle: string;
};

export type NpcProfile = {
  role?: string;
  summary?: string;
  goals: string[];
  fears: string[];
  convictions: string[];
  selfKnowledge: {
    known: string[];
    blindSpots: string[];
    denied: string[];
  };
};

export type NpcDisplayState = {
  arcs: Array<{
    arc: string;
    state?: string;
  }>;
  hooks: Array<{
    arc: string;
    fact: string;
    lifecycle: string;
    state?: string;
  }>;
};

export type RelationshipKnowledgeBuckets = {
  mutual: string[];
  fromKnows: string[];
  toKnows: string[];
  publicRumors: string[];
};

export type RelationshipBoundaryState = {
  state: string;
  qualifyingEvent?: string;
};

export type RelationshipQualifyingEventAudit = {
  event: string;
  axes: string[];
  publicFaceShift?: number;
  boundaryDomains: string[];
};

export type PlayerDelta = {
  attire?: string;
  inventory?: {
    add?: string[];
    remove?: string[];
  };
  physicalState?: string;
};

export type NewEntity = {
  name: string;
  tier?: NpcTier;
  location?: string;
};

export type StateUpdate = {
  sceneCast: SceneCast;
  timeAdvance?: TimeAdvance | null;
  npcDeltas: StateUpdateNpcDelta[];
  edgeDeltas: EdgeDelta[];
  secretDeltas: SecretDelta[];
  hookDeltas: HookDelta[];
  playerDeltas: PlayerDelta;
  newEntities: NewEntity[];
};

export type LedgerEntry = {
  name: string;
  location?: string;
  mood?: string;
  details: string[];
};

export type LedgerData = {
  focus: LedgerEntry | null;
  cast: LedgerEntry[];
  social: string[];
  knownPressure: string[];
  player: {
    details: string[];
    physicalState?: string;
  } | null;
};

export type NPCNode = {
  id: string;
  name: string;
  tier: NpcTier;
  aliases: string[];
  physicalState: {
    location?: string;
    mood?: string;
    attire?: string;
    injuries?: string;
    details: string[];
  };
  emotionalState?: EmotionalState;
  agendaNow?: string;
  sceneTurnCount: number;
  secrets: Array<{ secret: string; lifecycle: string; suspects: string[]; evidence: string[] }>;
  hooks: Array<{ arc: string; fact: string; lifecycle: string }>;
  description?: string;
  profile?: NpcProfile;
  display?: NpcDisplayState;
};

export type RelationshipEdge = {
  from: string;
  to: string;
  durable: Record<string, number>;
  momentary: Record<string, number>;
  boundaryChanges: Record<string, string>;
  qualifyingEvents: string[];
  knowledgeBuckets?: RelationshipKnowledgeBuckets;
  publicFace?: {
    score: number;
  };
  betrayalScar?: {
    score: number;
  };
  boundaryStates?: Record<string, RelationshipBoundaryState>;
  qualifyingEventAudit?: RelationshipQualifyingEventAudit[];
};

export type WorldGraph = {
  chatId: string;
  characterId?: string;
  detectedPreset: "mlrpe";
  createdAt: string;
  updatedAt: string;
  scenario?: string;
  worldTime?: TimeAdvance | null;
  sceneCast: SceneCast;
  npcs: Record<string, NPCNode>;
  relationships: Record<string, RelationshipEdge>;
  secrets: Array<{ secret: string; lifecycle: string; suspects: string[]; evidence: string[] }>;
  hooks: Array<{ arc: string; fact: string; lifecycle: string }>;
  player: {
    attire?: string;
    physicalState?: string;
    inventory: string[];
  };
};

export type SeedWorldGraphInput = {
  chatId: string;
  characterId?: string;
  characterName: string;
  characterDescription?: string;
  scenario?: string;
};

export type WorldSummary = {
  hasWorld: boolean;
  activeCast: string[];
  hotAlerts: string[];
  npcCount: number;
  relationshipCount: number;
};
