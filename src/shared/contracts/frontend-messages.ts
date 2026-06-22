import type {
  BackendToFrontendMessage,
  FrontendToBackendMessage,
} from "../types/lwe.js";

export function isFrontendToBackendMessage(
  value: unknown,
): value is FrontendToBackendMessage {
  return Boolean(value && typeof value === "object" && "type" in value);
}

export function isBackendToFrontendMessage(
  value: unknown,
): value is BackendToFrontendMessage {
  return Boolean(value && typeof value === "object" && "type" in value);
}
