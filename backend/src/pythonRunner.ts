import { spawn } from "child_process";
import { CONFIG } from "./config";
import { PythonScriptResult } from "./types";

export function runPythonScript(
  scriptPath: string,
  args: string[]
): Promise<PythonScriptResult> {
  return new Promise((resolve) => {
    const pythonProcess = spawn(CONFIG.PYTHON_PATH, [scriptPath, ...args]);
    let stdout = "";
    let stderr = "";

    pythonProcess.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    pythonProcess.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    pythonProcess.on("close", (code) => {
      resolve({ stdout, stderr, code });
    });
  });
}
