import {
  describe,
  it,
  expect,
  mock,
  spyOn,
  beforeEach,
  afterEach,
  vi,
} from "bun:test";
import { executeCommand, handleError, CommandOptions } from "../cli-utils";
import { WreckitError, InterruptedError, ConfigError } from "../errors";
import { Logger } from "../logging";

function createMockLogger(): Logger {
  return {
    debug: mock(() => {}),
    info: mock(() => {}),
    warn: mock(() => {}),
    error: mock(() => {}),
    json: mock(() => {}),
  };
}

describe("handleError", () => {
  let mockLogger: Logger;

  beforeEach(() => {
    mockLogger = createMockLogger();
  });

  it("formats WreckitError with code", () => {
    const error = new ConfigError("bad config");
    handleError(error, mockLogger, {});

    expect(mockLogger.error).toHaveBeenCalledWith("[CONFIG_ERROR] bad config");
  });

  it("formats regular Error message", () => {
    const error = new Error("something failed");
    handleError(error, mockLogger, {});

    expect(mockLogger.error).toHaveBeenCalledWith("something failed");
  });

  it("shows stack in verbose mode for regular Error", () => {
    const error = new Error("something failed");
    error.stack = "Error: something failed\n    at test.ts:1:1";
    handleError(error, mockLogger, { verbose: true });

    expect(mockLogger.error).toHaveBeenCalledWith("something failed");
    expect(mockLogger.debug).toHaveBeenCalledWith(
      "Error: something failed\n    at test.ts:1:1",
    );
  });

  it("does not show stack when not verbose", () => {
    const error = new Error("something failed");
    error.stack = "Error: something failed\n    at test.ts:1:1";
    handleError(error, mockLogger, { verbose: false });

    expect(mockLogger.error).toHaveBeenCalledWith("something failed");
    expect(mockLogger.debug).not.toHaveBeenCalled();
  });

  it("handles non-Error types", () => {
    handleError("string error", mockLogger, {});
    expect(mockLogger.error).toHaveBeenCalledWith("string error");
  });

  it("handles null/undefined", () => {
    handleError(null, mockLogger, {});
    expect(mockLogger.error).toHaveBeenCalledWith("null");

    handleError(undefined, mockLogger, {});
    expect(mockLogger.error).toHaveBeenCalledWith("undefined");
  });

  it("handles object types", () => {
    handleError({ foo: "bar" }, mockLogger, {});
    expect(mockLogger.error).toHaveBeenCalledWith("[object Object]");
  });
});

describe("executeCommand", () => {
  let mockLogger: Logger;
  let processExitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mockLogger = createMockLogger();
    processExitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(() => undefined as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does not exit on success", async () => {
    await executeCommand(async () => {}, mockLogger, {});

    expect(processExitSpy).not.toHaveBeenCalled();
    expect(mockLogger.error).not.toHaveBeenCalled();
  });

  it("logs WreckitError with code and exits 1", async () => {
    const error = new ConfigError("bad config");
    await executeCommand(
      async () => {
        throw error;
      },
      mockLogger,
      {},
    );

    expect(mockLogger.error).toHaveBeenCalledWith("[CONFIG_ERROR] bad config");
    expect(processExitSpy).toHaveBeenCalledWith(1);
  });

  it("logs regular Error message and exits 1", async () => {
    const error = new Error("something failed");
    await executeCommand(
      async () => {
        throw error;
      },
      mockLogger,
      {},
    );

    expect(mockLogger.error).toHaveBeenCalledWith("something failed");
    expect(processExitSpy).toHaveBeenCalledWith(1);
  });

  it("exits 130 for InterruptedError", async () => {
    const error = new InterruptedError();
    await executeCommand(
      async () => {
        throw error;
      },
      mockLogger,
      {},
    );

    expect(mockLogger.error).toHaveBeenCalledWith(
      "[INTERRUPTED] Operation interrupted",
    );
    expect(processExitSpy).toHaveBeenCalledWith(130);
  });

  it("exits 130 for Error with SIGINT message", async () => {
    const error = new Error("Process received SIGINT");
    await executeCommand(
      async () => {
        throw error;
      },
      mockLogger,
      {},
    );

    expect(processExitSpy).toHaveBeenCalledWith(130);
  });

  it("exits 1 for unknown error type", async () => {
    await executeCommand(
      async () => {
        throw "string error";
      },
      mockLogger,
      {},
    );

    expect(mockLogger.error).toHaveBeenCalledWith("string error");
    expect(processExitSpy).toHaveBeenCalledWith(1);
  });

  it("passes options to handleError", async () => {
    const error = new Error("something failed");
    error.stack = "Error: something failed\n    at test.ts:1:1";
    await executeCommand(
      async () => {
        throw error;
      },
      mockLogger,
      { verbose: true },
    );

    expect(mockLogger.debug).toHaveBeenCalledWith(
      "Error: something failed\n    at test.ts:1:1",
    );
  });
});
