interface StartupPool {
  end(): Promise<void>;
}

interface StartupApp {
  close(): Promise<void>;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Close the temporary admin pool without replacing the failure that triggered cleanup. */
export async function closeStartupPool(
  pool: StartupPool,
  preparationError?: unknown,
): Promise<void> {
  try {
    await pool.end();
  } catch (closeError) {
    throw new Error(
      `startup admin database pool close failed: ${errorText(closeError)}.${preparationError ? ` Original database preparation failure: ${errorText(preparationError)}.` : ''} Next: inspect active database clients and PostgreSQL health, then restart the API only after the pool can close cleanly.`,
    );
  }
}

/** Close a partly-created Nest application and preserve both startup and cleanup failures. */
export async function failStartupAndClose(
  app: StartupApp,
  startupError: unknown,
  port: number,
): Promise<never> {
  let cleanupDetail = '';
  try {
    await app.close();
  } catch (closeError) {
    cleanupDetail = ` Application cleanup also failed: ${errorText(closeError)}.`;
  }
  throw new Error(
    `API startup failed before listening on 0.0.0.0:${port}: ${errorText(startupError)}.${cleanupDetail} Next: confirm the port is free and run \`docker compose ps\` plus \`docker compose logs db redis\`, correct the reported dependency, then restart the stack.`,
  );
}
