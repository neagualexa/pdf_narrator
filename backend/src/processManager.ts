import { ChildProcess } from "child_process";
import { CONFIG } from "./config";

export class ProcessManager {
  private activeTtsProcesses = new Map<string, ChildProcess>();

  public getActiveTtsProcesses(): Map<string, ChildProcess> {
    return this.activeTtsProcesses;
  }

  public addProcess(processId: string, process: ChildProcess): void {
    this.activeTtsProcesses.set(processId, process);
  }

  public removeProcess(processId: string): void {
    this.activeTtsProcesses.delete(processId);
  }

  public cleanupProcess(processId: string): void {
    const process = this.activeTtsProcesses.get(processId);
    if (process) {
      try {
        process.kill("SIGTERM");
        setTimeout(() => {
          if (this.activeTtsProcesses.has(processId)) {
            const proc = this.activeTtsProcesses.get(processId);
            if (proc) {
              proc.kill("SIGKILL");
            }
            this.activeTtsProcesses.delete(processId);
          }
        }, CONFIG.CLEANUP.PROCESS_KILL_TIMEOUT_MS);
      } catch (error) {
        console.warn(`Failed to cleanup process ${processId}:`, error);
      } finally {
        this.activeTtsProcesses.delete(processId);
      }
    }
  }

  public cleanupAllProcesses(): void {
    this.activeTtsProcesses.forEach((process, id) => {
      this.cleanupProcess(id);
    });
  }
}

export const processManager = new ProcessManager();
