import { runCLI } from './cli.ts';

/** Process entry: runs the CLI and exits with its code. A code below zero means "keep running" (the daemon). */
export function main(): void {
  runCLI(process.argv.slice(2)).then(
    (code) => {
      if (code >= 0) {
        process.exit(code);
      }
    },
    (error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    },
  );
}
