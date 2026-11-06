import { rename, rm, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

/** Retry transient failures only, with a fresh timeout for every attempt. */
export async function fetchTextWithRetry(
  url: string,
  init: RequestInit = {},
  options: { attempts?: number; delayMs?: number; timeoutMs?: number; fetcher?: typeof fetch } = {},
): Promise<string> {
  const { attempts = 3, delayMs = 1000, timeoutMs = 20000, fetcher = fetch } = options;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetcher(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
      if (!response.ok) {
        if (response.status !== 429 && response.status < 500)
          throw new PermanentHttpError(`HTTP ${response.status}`);
        throw new Error(`HTTP ${response.status}`);
      }
      return await response.text();
    } catch (error) {
      if (error instanceof PermanentHttpError || attempt === attempts) throw error;
      console.warn(`temporary fetch failure (attempt ${attempt}/${attempts}); retrying`);
      await new Promise((resolve) => setTimeout(resolve, delayMs * attempt));
    }
  }
  throw new Error('no fetch attempts configured');
}
class PermanentHttpError extends Error {}

/** Write beside the destination, then replace it only after a complete write. */
export async function writeSnapshotAtomic(destination: URL, data: unknown): Promise<void> {
  const target = fileURLToPath(destination);
  const temp = `${target}.${randomUUID()}.tmp`;
  try {
    await writeFile(temp, JSON.stringify(data, null, 2) + '\n', { flag: 'wx' });
    await rename(temp, target);
  } finally {
    await rm(temp, { force: true });
  }
}
