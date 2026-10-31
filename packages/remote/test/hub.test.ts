import { describe, expect, it } from "vitest";
import { createSource, RemoteHub } from "../src/hub";
import { createMemoryWirePair } from "../src/memory-wire";
import type { Wire, WireMessage } from "../src/protocol";

class RecordingWire implements Wire {
  readonly messages: WireMessage[] = [];

  send(message: WireMessage): void {
    this.messages.push(message);
  }

  onMessage(): void {
    // Hub tests only observe outbound messages.
  }

  onClose(): void {
    // No reconnect behavior in the recording wire.
  }
}

describe("RemoteHub", () => {
  it("sends a snapshot immediately and a patch on every change", () => {
    const wire = new RecordingWire();
    const count = createSource(0);
    const hub = new RemoteHub(wire);

    hub.watch("count", count);
    expect(wire.messages).toEqual([{ kind: "patch", key: "count", value: 0 }]);

    count.set(1);
    expect(wire.messages).toEqual([
      { kind: "patch", key: "count", value: 0 },
      { kind: "patch", key: "count", value: 1 },
    ]);

    hub.dispose();
  });

  it("short-circuits structurally equal writes", () => {
    const wire = new RecordingWire();
    const value = createSource({ a: 1, nested: { b: 2 } });
    const hub = new RemoteHub(wire);

    hub.watch("value", value);
    wire.messages.length = 0;

    value.set({ a: 1, nested: { b: 2 } });
    expect(wire.messages).toEqual([]);

    value.set({ a: 1, nested: { b: 3 } });
    expect(wire.messages).toEqual([{ kind: "patch", key: "value", value: { a: 1, nested: { b: 3 } } }]);
  });

  it("tags a batch and terminates it with a barrier", () => {
    const wire = new RecordingWire();
    const left = createSource(0);
    const right = createSource(0);
    const hub = new RemoteHub(wire);

    hub.watch("left", left);
    hub.watch("right", right);
    wire.messages.length = 0;

    hub.batch(() => {
      left.set(1);
      right.set(2);
    }, "frame-1");

    expect(wire.messages).toEqual([
      { kind: "patch", key: "left", value: 1, batch_id: "frame-1" },
      { kind: "patch", key: "right", value: 2, batch_id: "frame-1" },
      { kind: "barrier", batch_id: "frame-1" },
    ]);

    hub.dispose();
  });

  it("emits a release when a publication is removed", () => {
    const wire = new RecordingWire();
    const value = createSource("a");
    const hub = new RemoteHub(wire);

    hub.watch("value", value);
    wire.messages.length = 0;

    hub.unwatch("value");
    expect(wire.messages).toEqual([{ kind: "release", key: "value" }]);

    value.set("b");
    expect(wire.messages).toEqual([{ kind: "release", key: "value" }]);
  });

  it("does not emit a release when a key is re-published", () => {
    const wire = new RecordingWire();
    const value = createSource("a");
    const hub = new RemoteHub(wire);

    hub.watch("value", value);
    wire.messages.length = 0;
    hub.watch("value", value);
    value.set("b");

    expect(wire.messages).toEqual([
      { kind: "patch", key: "value", value: "a" },
      { kind: "patch", key: "value", value: "b" },
    ]);
  });
});

describe("memory wire", () => {
  it("delivers messages synchronously and in order", () => {
    const [left, right] = createMemoryWirePair();
    const received: WireMessage[] = [];
    right.onMessage((message) => received.push(message));

    left.send({ kind: "patch", key: "a", value: 1 });
    left.send({ kind: "release", key: "a" });

    expect(received).toEqual([
      { kind: "patch", key: "a", value: 1 },
      { kind: "release", key: "a" },
    ]);
  });
});
