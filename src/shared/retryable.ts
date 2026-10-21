/** A value loaded on first use and kept; a load that fails is tried again on the next use, and reset() forgets the value. */
export function retryable<T>(load: () => Promise<T>): { get(): Promise<T>; reset(): void } {
  let value: Promise<T> | null = null
  return {
    get: () =>
      (value ??= load().catch((error) => {
        value = null
        throw error
      })),
    reset: () => void (value = null),
  }
}
