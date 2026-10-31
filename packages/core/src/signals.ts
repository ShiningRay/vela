import { batch, createSignal, untrack } from "solid-js";

export { batch, untrack };

export type Equality<T> = (prev: T, next: T) => boolean;

/**
 * Structural equality, the lesson kept from Citrine's Signal#set.
 *
 * Ruby's Hash/Array compare by value; JavaScript objects compare by reference.
 * Without a deep comparison, every render that builds a fresh style/props object
 * would wake up its effects even when nothing changed.
 */
export function deepEqual(
  a: unknown,
  b: unknown,
  seen: WeakMap<object, WeakSet<object>> = new WeakMap(),
): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== "object" || a === null) return false;
  if (typeof b !== "object" || b === null) return false;

  const left = a as object;
  const right = b as object;

  if (Object.getPrototypeOf(left) !== Object.getPrototypeOf(right)) return false;

  if (left instanceof Date) {
    return right instanceof Date && left.getTime() === right.getTime();
  }

  if (left instanceof RegExp) {
    return right instanceof RegExp && left.source === right.source && left.flags === right.flags;
  }

  if (left instanceof Map) {
    if (!(right instanceof Map) || left.size !== right.size) return false;
    for (const [key, value] of left) {
      if (!right.has(key) || !deepEqual(value, right.get(key), seen)) return false;
    }
    return true;
  }

  if (left instanceof Set) {
    if (!(right instanceof Set) || left.size !== right.size) return false;
    for (const value of left) {
      if (!right.has(value)) return false;
    }
    return true;
  }

  const visited = seen.get(left);
  if (visited?.has(right)) return true;
  if (visited) visited.add(right);
  else seen.set(left, new WeakSet([right]));

  if (Array.isArray(left)) {
    if (!Array.isArray(right) || left.length !== right.length) return false;
    for (let index = 0; index < left.length; index += 1) {
      if (!deepEqual(left[index], right[index], seen)) return false;
    }
    return true;
  }

  const prototype = Object.getPrototypeOf(left);
  if (prototype !== Object.prototype && prototype !== null) {
    // Class instances are compared by identity (already checked by Object.is above).
    return false;
  }

  if (Array.isArray(right)) return false;

  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) return false;

  for (const key of leftKeys) {
    if (!Object.prototype.hasOwnProperty.call(right, key)) return false;
    if (!deepEqual(
      (left as Record<string, unknown>)[key],
      (right as Record<string, unknown>)[key],
      seen,
    )) return false;
  }

  return true;
}

/**
 * createSignal with structural equality. Use it for state that holds objects,
 * arrays and maps; scalar signals keep Solid's default `Object.is` comparison.
 */
export function createDeepSignal<T>(value: T) {
  return createSignal<T>(value, { equals: deepEqual });
}
