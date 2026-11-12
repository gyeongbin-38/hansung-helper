import pRetry from 'p-retry';

/** Retry only a caller-approved, idempotent read. Never pass credentials here. */
export async function retrySchoolRead<T>(
  read: () => Promise<T>,
  retryable: (error: unknown) => boolean,
  signal?: AbortSignal,
): Promise<T> {
  class RetryableFailure extends Error {
    constructor(readonly original: Error) { super('temporary school read failure'); }
  }
  try {
    return await pRetry(async () => {
      try {
        return await read();
      } catch (error) {
        const original = error instanceof Error ? error : new Error('school read failed');
        throw new RetryableFailure(original);
      }
    }, {
      retries: 1, minTimeout: 150, maxTimeout: 300, randomize: true, signal,
      shouldRetry: ({ error }) => error instanceof RetryableFailure && retryable(error.original),
    });
  } catch (error) {
    throw error instanceof RetryableFailure ? error.original : error;
  }
}
