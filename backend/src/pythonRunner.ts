import { spawn } from "child_process";
import { CONFIG } from "./config";
import { PythonScriptResult } from "./types";

/**
 * Runs a Python script with `input` on its stdin. Input goes through stdin
 * rather than argv, which the OS caps (1 MB on macOS - a long book's text).
 */
export function runPythonScript(
  scriptPath: string,
  input: string
): Promise<PythonScriptResult> {
  return new Promise((resolve) => {
    const child = spawn(CONFIG.PYTHON_PATH, [scriptPath]);

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (data) => (stdout += data.toString()));
    child.stderr.on("data", (data) => (stderr += data.toString()));

    const finish = (code: number | null) => resolve({ stdout, stderr, code });
    child.on("close", finish);
    // A script that cannot start has no exit code of its own.
    child.on("error", (error) => {
      stderr += String(error);
      finish(-1);
    });

    child.stdin.end(input);
  });
}
