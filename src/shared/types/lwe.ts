export type LweOperationMode = "full_agency" | "observe_only" | "manual";

export type LweTaskSettings = {
  enabled: boolean;
  promptProfileId: string;
  temperature: number;
  maxTokens: number;
};

export type LweSettings = {
  enabled: boolean;
  operationMode: LweOperationMode;
  sidecar: {
    connectionId: string | null;
    modelOverride: string | null;
    allowMainConnectionFallback: boolean;
    timeoutMs: number;
  };
  injection: {
    tokenBudget: number;
    includeIntentions: boolean;
    includeKnowledgeLimits: boolean;
    maxIncomingActions: number;
  };
  time: {
    explicitOnly: boolean;
    allowTravelEstimates: boolean;
    dialogueMinutesPerTurn: number | null;
  };
  agency: {
    enabled: boolean;
    maxNpcEvaluationsPerTurn: number;
    allowPostTurnPreplanning: boolean;
    seededVariation: boolean;
    periodicMajorReviewMinutes: number | null;
  };
  profiles: {
    autoBuildCardCharacters: boolean;
    autoBuildRecurringNpcs: boolean;
    autoPromoteStrangerTurns: number | null;
    protectExplicitCardFields: boolean;
  };
  tasks: {
    profileBuilder: LweTaskSettings;
    profileUpdater: LweTaskSettings;
    stateExtractor: LweTaskSettings;
    timeInference: LweTaskSettings;
    agencyProcessor: LweTaskSettings;
    impactCompressor: LweTaskSettings;
  };
  ui: {
    dockDefaultTab:
      | "overview"
      | "people"
      | "agency"
      | "relationships"
      | "world"
      | "timeline"
      | "inspector";
    showOrbBadge: boolean;
    showHiddenState: boolean;
    showDecisionTrace: boolean;
  };
  debug: {
    enabled: boolean;
    retainRawSidecarResponses: boolean;
    logInterceptorPayloads: boolean;
    retainDecisionTraces: boolean;
  };
};

export type EntityRecord = {
  id: string;
  kind:
    | "player"
    | "character_card_principal"
    | "npc"
    | "location"
    | "faction"
    | "object";
  name: string;
  source: "seed" | "user" | "system";
  createdAt: string;
  updatedAt: string;
};

export type WorldClock = {
  currentTime: string | null;
  lastAdvanceSource: string | null;
};

export type WorldGraph = {
  schemaVersion: number;
  chatId: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
  mode: LweOperationMode;
  settingsSnapshot: LweSettings | null;
  world: {
    clock: WorldClock;
    locations: Record<string, { id: string; label: string; updatedAt: string }>;
    entities: Record<string, EntityRecord>;
    relationships: Record<
      string,
      {
        sourceId: string;
        targetId: string;
        stance: string;
        evidence: string;
        updatedAt: string;
      }
    >;
    events: Array<{
      id: string;
      kind: string;
      summary: string;
      participants: string[];
      locationId: string | null;
      createdAt: string;
    }>;
    actions: Array<{ id: string; kind: string; createdAt: string }>;
    knowledge: Array<{ id: string; scope: string; createdAt: string }>;
    profiles: Record<string, never>;
    factions: Record<string, never>;
    secrets: Array<{ id: string; label: string; createdAt: string }>;
    hooks: Array<{ id: string; label: string; createdAt: string }>;
  };
  sceneImpact: SceneImpact | null;
  patchState: {
    appliedPatchIds: string[];
    lastPatchId: string | null;
  };
  audit: {
    lastAcceptedPatchAt: string | null;
    lastRejectedPatchAt: string | null;
  };
};

export type SceneImpact = {
  time: string | null;
  location: string | null;
  committedFacts: string[];
  actionsInProgress: string[];
  activeIntentions: Array<{
    actor: string;
    intent: string;
    constraints: string[];
  }>;
  knowledgeLimits: string[];
};

export type SceneImpactSystemMessage = {
  role: "system";
  name: string;
  content: string;
};

export type PatchOperation =
  | { type: "initialize_graph"; settings: LweSettings }
  | { type: "update_settings_snapshot"; settings: LweSettings }
  | { type: "persist_scene_impact"; sceneImpact: SceneImpact | null }
  | { type: "append_audit_record"; entry: { category: string; detail: string } }
  | {
      type: "record_migration_result";
      migrationId: string;
      fromVersion: number;
      toVersion: number;
    }
  | {
      type: "record_generation_correlation";
      generationId: string;
      generationType: string;
    }
  | {
      type: "upsert_entity";
      entity: {
        id: string;
        kind:
          | "player"
          | "character_card_principal"
          | "npc"
          | "location"
          | "faction"
          | "object";
        name: string;
        source: "seed" | "user" | "system";
      };
    }
  | {
      type: "upsert_location";
      location: { id: string; label: string };
    }
  | {
      type: "append_event";
      event: {
        id: string;
        kind: string;
        summary: string;
        participants: string[];
        locationId: string | null;
        createdAt: string;
      };
    }
  | {
      type: "advance_clock";
      currentTime: string;
      source: string;
    }
  | {
      type: "append_committed_fact";
      fact: string;
    }
  | {
      type: "upsert_relationship";
      relationship: {
        sourceId: string;
        targetId: string;
        stance: string;
        evidence: string;
        updatedAt: string;
      };
    };

export type PatchProvenance = {
  source: string;
  detail: string;
};

export type PatchValidationResult = {
  valid: boolean;
  errors: string[];
};

export type PatchEnvelope = {
  patchId: string;
  chatId: string;
  baseRevision: number;
  sourceTask: string;
  operations: PatchOperation[];
  provenance: PatchProvenance;
  validationResult: PatchValidationResult;
  createdAt: string;
};

export type PatchApplyResult = {
  accepted: boolean;
  reason:
    | "accepted"
    | "duplicate_patch_id"
    | "revision_mismatch"
    | "validation_failed";
  nextRevision: number | null;
};

export type MigrationRecord = {
  migrationId: string;
  fromVersion: number;
  toVersion: number;
  appliedAt: string;
};

export type GenerationType =
  | "normal"
  | "continue"
  | "regenerate"
  | "swipe"
  | "impersonate"
  | "quiet"
  | "internal";

export type PendingGenerationMetadata = {
  chatId: string;
  generationType: GenerationType;
  provisionalRevision: number;
  timestamp: string;
};

export type GenerationCorrelationRecord = PendingGenerationMetadata & {
  generationId: string;
  commitEligible: boolean;
  status: "started" | "ended" | "stopped";
};

export type FrontendSettings = {
  orbVisible: boolean;
  orbPosition: {
    x: number;
    y: number;
  };
};

export type BackendToFrontendMessage =
  | { type: "OPEN_TRACKER" }
  | {
      type: "BOOTSTRAP_STATE";
      graph: WorldGraph | null;
      settings: FrontendSettings;
      debugEnabled: boolean;
    };

export type FrontendToBackendMessage =
  | { type: "REQUEST_BOOTSTRAP"; chatId: string | null }
  | { type: "OPEN_TRACKER" }
  | { type: "SAVE_FRONTEND_SETTINGS"; settings: FrontendSettings };
