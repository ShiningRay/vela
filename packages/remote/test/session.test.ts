import { describe, expect, it } from "vitest";
import { createSource, RemoteHub } from "../src/hub";
import { createMemoryWirePair } from "../src/memory-wire";
import { RemoteSession } from "../src/session";
import type { Wire, WireMessage } from "../src/protocol";

class RecordingWire implements Wire {
  readonly messages: WireMessage[] = [];

  send(message: WireMessage): void {
    this.messages.push(message);
  }

  onMessage(): void {
    // The session does not need inbound messages for this test.
  }

  onClose(): void {
    // No reconnect behavior in the recording wire.
  }
}

describe("RemoteSession", () => {
  it("receives snapshots and patches from a hub", () => {
    const [serverWire, clientWire] = createMemoryWirePair();
    const session = new RemoteSession(clientWire);
    const count = createSource(0);

    const hub = new RemoteHub(serverWire);
    hub.watch("count", count);

    const mirrored = session.signal("count", -1);
    expect(mirrored.get()).toBe(0);

    count.set(1);
    expect(mirrored.get()).toBe(1);

    hub.dispose();
  });

  it("sends proposals for local writes without waiting for the authority", () => {
    const wire = new RecordingWire();
    const session = new RemoteSession(wire);
    const mirrored = session.signal("count", 0);

    mirrored.set(5);

    expect(mirrored.get()).toBe(5);
    expect(wire.messages).toEqual([{ kind: "propose", key: "count", value: 5 }]);
  });

  it("holds patches until the matching barrier arrives", () => {
    const [serverWire, clientWire] = createMemoryWirePair();
    const session = new RemoteSession(clientWire);
    const left = session.signal("left", 0);
    const right = session.signal("right", 0);

    serverWire.send({ kind: "patch", key: "left", value: 1, batch_id: "frame-1" });
    serverWire.send({ kind: "patch", key: "right", value: 2, batch_id: "frame-1" });

    expect(left.get()).toBe(0);
    expect(right.get()).toBe(0);

    serverWire.send({ kind: "barrier", batch_id: "frame-1" });

    expect(left.get()).toBe(1);
    expect(right.get()).toBe(2);
  });

  it("releases a key and rebuilds it on the next patch", () => {
    const [serverWire, clientWire] = createMemoryWirePair();
    const session = new RemoteSession(clientWire);
    const value = session.signal("value", "initial");

    serverWire.send({ kind: "patch", key: "value", value: "remote" });
    expect(value.get()).toBe("remote");

    serverWire.send({ kind: "release", key: "value" });
    expect(value.get()).toBeUndefined();

    serverWire.send({ kind: "patch", key: "value", value: "rebuilt" });
    expect(session.signal("value", "fallback").get()).toBe("rebuilt");
  });
});
