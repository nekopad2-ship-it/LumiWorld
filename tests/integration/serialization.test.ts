import { test } from "node:test";
import assert from "node:assert/strict";

import { createPerChatSerializer } from "../../src/backend/orchestration/serializer.js";

test("same-chat work is serialized while different chats may run concurrently", async () => {
  const serializer = createPerChatSerializer();
  const order: string[] = [];

  const slow = serializer.run("chat-1", async () => {
    order.push("slow:start");
    await new Promise((resolve) => setTimeout(resolve, 20));
    order.push("slow:end");
  });

  const fastSameChat = serializer.run("chat-1", async () => {
    order.push("same:start");
    order.push("same:end");
  });

  const otherChat = serializer.run("chat-2", async () => {
    order.push("other:start");
    order.push("other:end");
  });

  await Promise.all([slow, fastSameChat, otherChat]);

  assert.deepEqual(order.slice(0, 2), ["slow:start", "other:start"]);
  assert.ok(order.indexOf("same:start") > order.indexOf("slow:end"));
});
