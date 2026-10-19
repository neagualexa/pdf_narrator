import { ChildProcessWithoutNullStreams, spawn } from "child_process";
import readline from "readline";
import { CONFIG } from "./config";

/** What a job's caller learns: done, failed, or dropped by a stop request. */
export type SpeechResult =
  | { status: "done" }
  | { status: "failed"; error: string }
  | { status: "stopped" };

interface QueuedJob {
  line: string;
  resolve: (result: SpeechResult) => void;
}

/**
 * The one Python process that speaks sentences (generate_audio.py), kept up
 * so each voice model loads once rather than once per sentence.
 *
 * Jobs run one at a time, in the order asked for. A stop request drops the
 * jobs still waiting, but lets the one being spoken finish: killing it would
 * also throw away the loaded voices, and its audio is cached for when it is
 * wanted again. A worker that dies fails its job and is restarted by the next.
 */
class SpeechWorker {
  private child: ChildProcessWithoutNullStreams | null = null;
  private queue: QueuedJob[] = [];
  private running: QueuedJob | null = null;

  speak(job: object): Promise<SpeechResult> {
    return new Promise((resolve) => {
      this.queue.push({ line: JSON.stringify(job) + "\n", resolve });
      this.next();
    });
  }

  /** Drops every job not yet started; returns how many there were. */
  cancelQueued(): number {
    const dropped = this.queue.splice(0);
    dropped.forEach((job) => job.resolve({ status: "stopped" }));
    return dropped.length;
  }

  private next(): void {
    if (this.running || this.queue.length === 0) return;
    this.running = this.queue.shift()!;
    this.start().stdin.write(this.running.line);
  }

  private finish(result: SpeechResult): void {
    this.running?.resolve(result);
    this.running = null;
    this.next();
  }

  private start(): ChildProcessWithoutNullStreams {
    if (this.child) return this.child;

    const child = spawn(CONFIG.PYTHON_PATH, [CONFIG.SCRIPTS.GENERATE_AUDIO]);
    this.child = child;

    readline.createInterface({ input: child.stdout }).on("line", (line) => {
      try {
        const answer = JSON.parse(line);
        this.finish(
          answer.success
            ? { status: "done" }
            : { status: "failed", error: answer.error ?? "Audio generation failed." }
        );
      } catch {
        console.warn("Unexpected output from the speech worker:", line);
      }
    });
    child.stderr.on("data", (data) => process.stderr.write(data));

    const died = (reason: string) => {
      if (this.child !== child) return;
      this.child = null;
      this.finish({ status: "failed", error: `Speech worker ${reason}.` });
    };
    child.on("exit", (code, signal) => died(`exited (${signal ?? code})`));
    child.on("error", (error) => died(`could not start: ${error.message}`));

    return child;
  }
}

export const speechWorker = new SpeechWorker();
