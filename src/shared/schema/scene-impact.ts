import type { SceneImpact, SceneImpactSystemMessage } from "../types/lwe.js";

export function createEmptySceneImpact(): SceneImpact {
  return {
    time: null,
    location: null,
    committedFacts: [],
    actionsInProgress: [],
    activeIntentions: [],
    knowledgeLimits: [],
  };
}

export function toSceneImpactSystemMessage(
  sceneImpact: SceneImpact,
): SceneImpactSystemMessage {
  const lines = [
    "LWE_SCENE_IMPACT:",
    `  time: ${sceneImpact.time ?? ""}`,
    `  location: ${sceneImpact.location ?? ""}`,
    "  committed_facts:",
    ...sceneImpact.committedFacts.map((fact) => `    - ${fact}`),
    "  actions_in_progress:",
    ...sceneImpact.actionsInProgress.map((item) => `    - ${item}`),
    "  active_intentions:",
    ...sceneImpact.activeIntentions.map(
      (item) =>
        `    - actor: ${item.actor}; intent: ${item.intent}; constraints: ${item.constraints.join(", ")}`,
    ),
    "  knowledge_limits:",
    ...sceneImpact.knowledgeLimits.map((item) => `    - ${item}`),
  ];

  return {
    role: "system",
    content: lines.join("\n"),
  };
}
