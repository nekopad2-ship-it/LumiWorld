import type {
  FrontendSettings,
  LweSettings,
  LweTaskSettings,
} from "../types/lwe.js";

function createTaskSettings(): LweTaskSettings {
  return {
    enabled: false,
    promptProfileId: "default",
    temperature: 0,
    maxTokens: 0,
  };
}

export function createDefaultSettings(): LweSettings {
  return {
    enabled: true,
    operationMode: "full_agency",
    sidecar: {
      connectionId: null,
      modelOverride: null,
      allowMainConnectionFallback: false,
      timeoutMs: 12000,
    },
    injection: {
      tokenBudget: 250,
      includeIntentions: true,
      includeKnowledgeLimits: true,
      maxIncomingActions: 4,
    },
    time: {
      explicitOnly: true,
      allowTravelEstimates: true,
      dialogueMinutesPerTurn: null,
    },
    agency: {
      enabled: true,
      maxNpcEvaluationsPerTurn: 6,
      allowPostTurnPreplanning: true,
      seededVariation: true,
      periodicMajorReviewMinutes: null,
    },
    profiles: {
      autoBuildCardCharacters: true,
      autoBuildRecurringNpcs: true,
      autoPromoteStrangerTurns: 3,
      protectExplicitCardFields: true,
    },
    tasks: {
      profileBuilder: createTaskSettings(),
      profileUpdater: createTaskSettings(),
      stateExtractor: createTaskSettings(),
      timeInference: createTaskSettings(),
      agencyProcessor: createTaskSettings(),
      impactCompressor: createTaskSettings(),
    },
    ui: {
      dockDefaultTab: "overview",
      showOrbBadge: true,
      showHiddenState: true,
      showDecisionTrace: false,
    },
    debug: {
      enabled: false,
      retainRawSidecarResponses: false,
      logInterceptorPayloads: false,
      retainDecisionTraces: false,
    },
  };
}

export function createDefaultFrontendSettings(): FrontendSettings {
  return {
    orbVisible: true,
    orbPosition: {
      x: 24,
      y: 24,
    },
  };
}
