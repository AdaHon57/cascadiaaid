/** Load .env.local / .env for CLI scripts (the dev server loads them for the app). */
import { existsSync } from "node:fs";

export function loadEnvFiles(): void {
  // Existing variables are never overwritten, so .env.local takes precedence over .env.
  for (const file of [".env.local", ".env"]) {
    if (existsSync(file)) process.loadEnvFile(file);
  }
}
