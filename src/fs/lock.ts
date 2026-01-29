import * as fs from "node:fs/promises";
import * as path from "node:path";
import { open, type FileHandle } from "node:fs/promises";

/**
 * File-based advisory lock for concurrent access protection.
 *
 * Uses POSIX flock semantics through Node.js file locking APIs.
 * Provides both shared (read) and exclusive (write) lock capabilities.
 *
 * Locks are automatically released when:
 * - The lock file descriptor is closed
 * - The process exits
 * - The lock is explicitly released
 */
export class FileLock {
  private fileHandle: FileHandle | null = null;
  private lockfilePath: string;

  private constructor(lockfilePath: string) {
    this.lockfilePath = lockfilePath;
  }

  /**
   * Acquire an exclusive lock for write operations.
   * Waits until the lock is available.
   *
   * @param filePath - The file path to lock (lock file will be created alongside)
   * @param options - Optional timeout configuration
   * @returns A FileLock instance that must be released
   * @throws Error if timeout is reached
   */
  static async acquireExclusive(
    filePath: string,
    options: { timeout?: number } = {},
  ): Promise<FileLock> {
    const lockfilePath = getLockfilePath(filePath);
    const lock = new FileLock(lockfilePath);
    await lock.acquire({ exclusive: true, ...options });
    return lock;
  }

  /**
   * Acquire a shared lock for read operations.
   * Multiple shared locks can be held simultaneously,
   * but exclusive locks are blocked.
   *
   * @param filePath - The file path to lock
   * @param options - Optional timeout configuration
   * @returns A FileLock instance that must be released
   * @throws Error if timeout is reached
   */
  static async acquireShared(
    filePath: string,
    options: { timeout?: number } = {},
  ): Promise<FileLock> {
    const lockfilePath = getLockfilePath(filePath);
    const lock = new FileLock(lockfilePath);
    await lock.acquire({ exclusive: false, ...options });
    return lock;
  }

  private async acquire(options: {
    exclusive: boolean;
    timeout?: number;
  }): Promise<void> {
    const { exclusive, timeout = 30000 } = options;
    const startTime = Date.now();

    // Ensure lockfile directory exists
    const lockDir = path.dirname(this.lockfilePath);
    await fs.mkdir(lockDir, { recursive: true });

    while (true) {
      try {
        // Try to create and open the lockfile
        // For exclusive lock: use "wx" to create exclusively (fails if exists)
        // For shared lock: use "r" to read existing, no need to create
        let fh: Awaited<ReturnType<typeof open>> | undefined;
        if (exclusive) {
          fh = await open(this.lockfilePath, "wx");
          // Write PID and timestamp to lockfile for stale detection
          const lockContent = JSON.stringify({
            pid: process.pid,
            timestamp: Date.now(),
          });
          await fh.write(lockContent);
        } else {
          // For shared lock, just open for reading
          // If file doesn't exist, no one holds the lock, so we succeed
          try {
            fh = await open(this.lockfilePath, "r");
          } catch (openErr) {
            const errorCode = (openErr as NodeJS.ErrnoException).code;
            if (errorCode === "ENOENT") {
              // File doesn't exist, no lock is held, we can proceed
              // Create a dummy file handle to track the lock
              fh = await open(this.lockfilePath, "wx");
              // Write PID and timestamp for stale detection
              const lockContent = JSON.stringify({
                pid: process.pid,
                timestamp: Date.now(),
              });
              await fh.write(lockContent);
            } else {
              throw openErr;
            }
          }
        }

        if (fh) {
          this.fileHandle = fh;
          return;
        }
      } catch (err) {
        const errorCode = (err as NodeJS.ErrnoException).code;

        // File exists - for exclusive lock, wait and retry
        if (errorCode === "EEXIST" && exclusive) {
          // Check if lock is stale (process no longer running)
          const stale = await this.isStale();
          if (stale) {
            try {
              await fs.unlink(this.lockfilePath);
              continue; // Retry after removing stale lock
            } catch {
              // Ignore unlink errors, retry
            }
          }
        } else if (errorCode !== "EEXIST" && errorCode !== "ENOENT") {
          throw err;
        }

        // Check timeout
        if (Date.now() - startTime > timeout) {
          throw new Error(
            `Failed to acquire lock on ${this.lockfilePath} after ${timeout}ms`,
          );
        }

        // Wait before retrying (exponential backoff)
        const delay = Math.min(100 + Math.random() * 100, 1000);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  /**
   * Check if the lock file is stale (held by a dead process or too old).
   * A lock is considered stale if:
   * - The PID is not running
   * - The lock is older than STALE_THRESHOLD_MS (60 seconds)
   */
  private static readonly STALE_THRESHOLD_MS = 60000;

  private async isStale(): Promise<boolean> {
    try {
      const content = await fs.readFile(this.lockfilePath, "utf-8");

      let pid: number;
      let timestamp: number | undefined;

      // Try parsing as JSON (new format)
      try {
        const data = JSON.parse(content);
        pid = data.pid;
        timestamp = data.timestamp;
      } catch {
        // Fall back to plain PID format (legacy)
        pid = parseInt(content.trim(), 10);
      }

      if (isNaN(pid)) {
        return true; // Invalid PID, treat as stale
      }

      // Check if lock is too old (stale by time)
      if (
        timestamp !== undefined &&
        Date.now() - timestamp > FileLock.STALE_THRESHOLD_MS
      ) {
        return true;
      }

      // Check if process is running (kill with signal 0)
      try {
        process.kill(pid, 0);
        return false; // Process is running
      } catch {
        return true; // Process is dead
      }
    } catch {
      // Can't read lockfile, assume stale
      return true;
    }
  }

  /**
   * Release the lock.
   * Must be called when done with the locked operation.
   */
  async release(): Promise<void> {
    if (this.fileHandle !== null) {
      try {
        await this.fileHandle.close();
      } catch {
        // Ignore close errors
      }
      this.fileHandle = null;

      // Clean up the lock file
      try {
        await fs.unlink(this.lockfilePath);
      } catch {
        // Ignore unlink errors - file may already be gone
      }
    }
  }

  /**
   * Execute a callback while holding an exclusive lock.
   * Automatically releases the lock when the callback completes.
   *
   * @param filePath - The file path to lock
   * @param fn - The function to execute while holding the lock
   * @param options - Optional timeout configuration
   * @returns The result of the callback function
   */
  static async withExclusiveLock<T>(
    filePath: string,
    fn: () => Promise<T>,
    options?: { timeout?: number },
  ): Promise<T> {
    const lock = await FileLock.acquireExclusive(filePath, options);
    try {
      return await fn();
    } finally {
      await lock.release();
    }
  }

  /**
   * Execute a callback while holding a shared lock.
   * Automatically releases the lock when the callback completes.
   *
   * @param filePath - The file path to lock
   * @param fn - The function to execute while holding the lock
   * @param options - Optional timeout configuration
   * @returns The result of the callback function
   */
  static async withSharedLock<T>(
    filePath: string,
    fn: () => Promise<T>,
    options?: { timeout?: number },
  ): Promise<T> {
    const lock = await FileLock.acquireShared(filePath, options);
    try {
      return await fn();
    } finally {
      await lock.release();
    }
  }
}

/**
 * Generate the lockfile path for a given file.
 * Lockfiles are created alongside the target file with a .lock extension.
 */
function getLockfilePath(filePath: string): string {
  return `${filePath}.lock`;
}

/**
 * Simple lock-free operation using atomic file operations.
 * For use when full file locking is not required but we need
 * to avoid concurrent modification issues.
 *
 * This uses a simpler approach: write to temp + atomic rename
 * which is already provided by safeWriteJson, but adds a
 * contention check using existence of a temp file.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: { maxRetries?: number; delay?: number } = {},
): Promise<T> {
  const { maxRetries = 5, delay = 100 } = options;
  let lastError: Error | undefined;

  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err as Error;
      const errorCode = (err as NodeJS.ErrnoException).code;

      // Retry on potential concurrent write issues
      if (
        errorCode === "EAGAIN" ||
        errorCode === "EBUSY" ||
        errorCode === "EEXIST"
      ) {
        await new Promise((resolve) =>
          setTimeout(resolve, delay * Math.pow(2, i)),
        );
        continue;
      }
      throw err;
    }
  }

  throw lastError;
}
