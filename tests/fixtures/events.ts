/** Extension events (runtime.onMessage, storage.onChanged, Port.onMessage…) whose listeners the test fires. */

export function fakeEvent<A extends unknown[]>() {
  const listeners: ((...args: A) => unknown)[] = []
  return {
    listeners,
    addListener: (listener: (...args: A) => unknown) => void listeners.push(listener),
    removeListener: (listener: (...args: A) => unknown) => {
      const at = listeners.indexOf(listener)
      if (at !== -1) listeners.splice(at, 1)
    },
    /** Call every listener in the order they were added; their return values. */
    fire: (...args: A) => listeners.map((listener) => listener(...args)),
  }
}

export type FakeEvent<A extends unknown[]> = ReturnType<typeof fakeEvent<A>>
