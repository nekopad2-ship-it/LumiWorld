import { buildCorrelationRecord } from "../../shared/schema/generation.js";
import type {
  GenerationCorrelationRecord,
  PendingGenerationMetadata,
} from "../../shared/types/lwe.js";

export function createGenerationCorrelationService() {
  const recordsByGenerationId = new Map<string, GenerationCorrelationRecord>();
  const pendingByChat = new Map<string, PendingGenerationMetadata>();
  const startedWithoutMetadata = new Map<
    string,
    { generationId: string; chatId: string }
  >();

  function bindPendingMetadata(chatId: string): void {
    const pending = pendingByChat.get(chatId);
    const started = startedWithoutMetadata.get(chatId);
    if (!pending || !started) {
      return;
    }

    recordsByGenerationId.set(
      started.generationId,
      buildCorrelationRecord(started.generationId, pending),
    );
    pendingByChat.delete(chatId);
    startedWithoutMetadata.delete(chatId);
  }

  return {
    capturePendingFromInterceptor(metadata: PendingGenerationMetadata) {
      pendingByChat.set(metadata.chatId, metadata);
      bindPendingMetadata(metadata.chatId);
    },
    onGenerationStarted(event: { generationId: string; chatId: string }) {
      const pending = pendingByChat.get(event.chatId);
      if (pending) {
        recordsByGenerationId.set(
          event.generationId,
          buildCorrelationRecord(event.generationId, pending),
        );
        pendingByChat.delete(event.chatId);
        return;
      }
      startedWithoutMetadata.set(event.chatId, event);
    },
    onGenerationEnded(event: { generationId: string }) {
      const record = recordsByGenerationId.get(event.generationId);
      if (record) {
        recordsByGenerationId.set(event.generationId, {
          ...record,
          status: "ended",
        });
      }
    },
    onGenerationStopped(event: { generationId: string }) {
      const record = recordsByGenerationId.get(event.generationId);
      if (record) {
        recordsByGenerationId.set(event.generationId, {
          ...record,
          status: "stopped",
        });
      }
    },
    getRecord(generationId: string): GenerationCorrelationRecord | undefined {
      return recordsByGenerationId.get(generationId);
    },
  };
}
