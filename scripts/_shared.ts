// Shared by the scripts: env loading and the explicit state lines.
import type { CheckState } from "../lib/schemas/api";

export type Check = { state: CheckState; detail: string };

export function loadEnv() {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    // no .env.local: the process environment is used as is
  }
}

export const line = (label: string, c: Check) => console.log(`${c.state.padEnd(14)} ${label.padEnd(14)} ${c.detail}`);

/** True when this file is the script being run (not imported by doctor.ts). */
export const isMain = (file: string) => (process.argv[1] ?? "").endsWith(file);

export function run(main: () => Promise<number>) {
  main().then(
    (code) => process.exit(code),
    (err) => {
      console.error(`FAIL           unexpected     ${err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
    },
  );
}
