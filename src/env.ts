/** A process env or a test double. Bracket access so Next does not inline values at build time. */
export type Env = Record<string, string | undefined>;

export function readEnv(env: Env, key: string): string {
  const value = env[key];
  return typeof value === "string" ? value.trim() : "";
}
