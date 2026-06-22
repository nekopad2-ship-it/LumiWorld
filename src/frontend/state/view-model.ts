import { createDefaultFrontendSettings } from "../../shared/schema/settings.js";
import type { FrontendSettings } from "../../shared/types/lwe.js";

export type FrontendViewModel = {
  settings: FrontendSettings;
};

export function createFrontendViewModel(): FrontendViewModel {
  return {
    settings: createDefaultFrontendSettings(),
  };
}
