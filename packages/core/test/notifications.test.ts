import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_NOTIFICATION_TIMEOUT, NotificationCenter } from "../src/notifications";

describe("NotificationCenter", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("stacks notifications and dismisses them by id", () => {
    const center = new NotificationCenter({ defaultTimeoutMs: 0 });
    const first = center.push("First");
    const second = center.push("Second", "Body");

    expect(center.items.map((item) => item.id)).toEqual([first.id, second.id]);
    center.dismiss(first.id);
    expect(center.items.map((item) => item.id)).toEqual([second.id]);
    center.dispose();
  });

  it("auto-dismisses after the default timeout", () => {
    vi.useFakeTimers();
    const center = new NotificationCenter();
    center.push("Transient");

    expect(center.items).toHaveLength(1);
    vi.advanceTimersByTime(DEFAULT_NOTIFICATION_TIMEOUT - 1);
    expect(center.items).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(center.items).toHaveLength(0);
  });

  it("supports pinned notifications and clears pending timers", () => {
    vi.useFakeTimers();
    const center = new NotificationCenter({ defaultTimeoutMs: 100 });
    center.push("Pinned", undefined, { timeoutMs: 0 });
    center.push("Transient");

    vi.advanceTimersByTime(100);
    expect(center.items.map((item) => item.title)).toEqual(["Pinned"]);

    center.clear();
    expect(center.items).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
    center.dispose();
  });

  it("notifies the host bridge for every pushed notification", () => {
    const onPush = vi.fn();
    const center = new NotificationCenter({ defaultTimeoutMs: 0, onPush });
    const notification = center.push("Bridge", "System mirror");
    expect(onPush).toHaveBeenCalledWith(notification);
    center.dispose();
  });
});
