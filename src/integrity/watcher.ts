import chokidar from "chokidar";
import * as path from "node:path";
import { resolveCwd, findRepoRoot } from "../fs/paths";
import { safeRebuild } from "./builder";
import type { Logger } from "../logging";

export interface WatcherOptions {
  cwd?: string;
  root?: string;
  debounceMs?: number;
  logger?: Logger;
  onChange?: (files: string[]) => void;
  onBuildStart?: () => void;
  onBuildSuccess?: (duration: number) => void;
  onBuildError?: (error: string) => void;
}

export interface WatcherHandle {
  stop: () => Promise<void>;
}

/**
 * Watchdog file watcher service.
 *
 * Monitors source files for changes and triggers rebuilds.
 */
export class FileWatcher {
  private watcher?: chokidar.FSWatcher;
  private rebuildTimeout?: NodeJS.Timeout;
  private options: WatcherOptions;
  private root: string;
  private log: Logger;

  constructor(options: WatcherOptions = {}) {
    this.options = {
      debounceMs: 500,
      ...options,
    };
    this.root = this.options.root ?? findRepoRoot(options.cwd ?? resolveCwd());
    this.log = this.options.logger || console;
  }

  /**
   * Start watching files for changes.
   */
  start(): WatcherHandle {
    const pathsToWatch = [
      path.join(this.root, "src/**/*.ts"),
      path.join(this.root, "src/prompts/**/*.md"),
      path.join(this.root, "package.json"),
    ];

    this.log.info("Starting file watcher...");
    this.log.debug(`Watching: ${pathsToWatch.join(", ")}`);

    this.watcher = chokidar.watch(pathsToWatch, {
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 200,
        pollInterval: 100,
      },
    });

    let changedFiles: string[] = [];

    this.watcher.on("change", (filePath: string) => {
      this.log.debug(`File changed: ${filePath}`);
      changedFiles.push(filePath);
      this.scheduleRebuild(changedFiles);
      changedFiles = []; // Reset for next batch
    });

    this.watcher.on("add", (filePath: string) => {
      this.log.debug(`File added: ${filePath}`);
      changedFiles.push(filePath);
      this.scheduleRebuild(changedFiles);
      changedFiles = [];
    });

    this.watcher.on("unlink", (filePath: string) => {
      this.log.debug(`File removed: ${filePath}`);
      changedFiles.push(filePath);
      this.scheduleRebuild(changedFiles);
      changedFiles = [];
    });

    this.watcher.on("error", (error: Error) => {
      this.log.error(`Watcher error: ${error}`);
    });

    this.watcher.on("ready", () => {
      this.log.info("File watcher ready");
    });

    return {
      stop: async () => {
        await this.stop();
      },
    };
  }

  /**
   * Schedule a rebuild after debouncing.
   */
  private scheduleRebuild(files: string[]): void {
    if (this.rebuildTimeout) {
      clearTimeout(this.rebuildTimeout);
    }

    this.log.debug(`Scheduling rebuild in ${this.options.debounceMs}ms...`);

    if (this.options.onChange) {
      this.options.onChange(files);
    }

    this.rebuildTimeout = setTimeout(async () => {
      await this.triggerRebuild();
    }, this.options.debounceMs);
  }

  /**
   * Trigger a rebuild.
   */
  private async triggerRebuild(): Promise<void> {
    this.log.info("Source files changed, rebuilding...");

    if (this.options.onBuildStart) {
      this.options.onBuildStart();
    }

    const result = await safeRebuild({
      root: this.root,
      logger: this.log,
    });

    if (result.success) {
      this.log.info(`Build completed successfully in ${result.duration}ms`);
      if (this.options.onBuildSuccess) {
        this.options.onBuildSuccess(result.duration || 0);
      }
    } else {
      this.log.error(`Build failed: ${result.error}`);
      if (this.options.onBuildError) {
        this.options.onBuildError(result.error || "Unknown error");
      }
    }
  }

  /**
   * Stop watching files.
   */
  async stop(): Promise<void> {
    if (this.rebuildTimeout) {
      clearTimeout(this.rebuildTimeout);
      this.rebuildTimeout = undefined;
    }

    if (this.watcher) {
      this.log.info("Stopping file watcher...");
      await this.watcher.close();
      this.watcher = undefined;
    }
  }
}

/**
 * Start the file watcher with default options.
 */
export function startWatcher(options: WatcherOptions = {}): WatcherHandle {
  const watcher = new FileWatcher(options);
  return watcher.start();
}
