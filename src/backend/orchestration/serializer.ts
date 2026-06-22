export function createPerChatSerializer() {
  const queueByChat = new Map<string, Promise<void>>();

  async function run<T>(chatId: string, work: () => Promise<T>): Promise<T> {
    const previous = queueByChat.get(chatId) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    queueByChat.set(
      chatId,
      previous.then(() => gate),
    );

    await previous;
    try {
      return await work();
    } finally {
      release();
      if (queueByChat.get(chatId) === gate) {
        queueByChat.delete(chatId);
      }
    }
  }

  return { run };
}
