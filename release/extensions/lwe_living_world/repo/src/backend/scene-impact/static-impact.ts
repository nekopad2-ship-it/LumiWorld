import {
  createEmptySceneImpact,
  toSceneImpactSystemMessage,
} from "../../shared/schema/scene-impact.js";
import type {
  SceneImpact,
  SceneImpactSystemMessage,
  WorldGraph,
} from "../../shared/types/lwe.js";

export function buildStaticSceneImpact(graph: WorldGraph): SceneImpact {
  const impact = createEmptySceneImpact();
  impact.time = graph.world.clock.currentTime;
  return impact;
}

export function buildSceneImpactSystemMessage(
  sceneImpact: SceneImpact,
): SceneImpactSystemMessage {
  return toSceneImpactSystemMessage(sceneImpact);
}
