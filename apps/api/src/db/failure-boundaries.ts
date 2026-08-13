interface ReleasableClient {
  release(): void;
}

export interface CleanupStep {
  name: string;
  run(): unknown | Promise<unknown>;
}

export function failureText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Release a checked-out client without losing the operation failure. */
export function releaseDatabaseClient(
  client: ReleasableClient,
  operation: string,
  operationError?: unknown,
): void {
  try {
    client.release();
  } catch (releaseError) {
    throw new Error(
      `${operation} database client release failed: ${failureText(releaseError)}.${operationError ? ` Original operation failure: ${failureText(operationError)}.` : ''} Next: inspect checked-out database clients and pool health, then retry only after the client can be released cleanly.`,
    );
  }
}

/** Run every cleanup even when a cleanup function throws before returning a promise. */
export async function cleanupFailures(steps: CleanupStep[]): Promise<string[]> {
  const results = await Promise.allSettled(
    steps.map((step) => Promise.resolve().then(() => step.run())),
  );
  return results.flatMap((result, index) =>
    result.status === 'rejected'
      ? [`${steps[index].name}: ${failureText(result.reason)}`]
      : [],
  );
}
