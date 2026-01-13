import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createLogger, initLogger, setLogger, logger, type Logger } from '../logging';
import {
  WreckitError,
  InterruptedError,
  toExitCode,
  wrapError,
  isWreckitError,
  ConfigError,
} from '../errors';

describe('Logger', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Logger interface', () => {
    it('implements all required methods', () => {
      const log = createLogger();

      expect(typeof log.debug).toBe('function');
      expect(typeof log.info).toBe('function');
      expect(typeof log.warn).toBe('function');
      expect(typeof log.error).toBe('function');
      expect(typeof log.json).toBe('function');
    });

    it('can be called without throwing', () => {
      const log = createLogger({ noColor: true });

      expect(() => log.debug('debug message')).not.toThrow();
      expect(() => log.info('info message')).not.toThrow();
      expect(() => log.warn('warn message')).not.toThrow();
      expect(() => log.error('error message')).not.toThrow();
    });

    it('accepts additional arguments', () => {
      const log = createLogger();

      expect(() => log.debug('debug', 'arg1', 'arg2')).not.toThrow();
      expect(() => log.info('info', { key: 'value' })).not.toThrow();
      expect(() => log.warn('warn', 123, true)).not.toThrow();
      expect(() => log.error('error', new Error('test'))).not.toThrow();
    });
  });

  describe('json output', () => {
    it('outputs valid JSON', () => {
      const log = createLogger();
      const data = { foo: 'bar', num: 42, nested: { a: 1 } };

      log.json(data);

      expect(consoleLogSpy).toHaveBeenCalledWith(JSON.stringify(data));
    });
  });

  describe('initLogger', () => {
    it('creates and sets a global logger', () => {
      const originalLogger = logger;
      const newLogger = initLogger({ verbose: true });

      expect(newLogger).toBeDefined();
      expect(newLogger).not.toBe(originalLogger);

      setLogger(originalLogger);
    });
  });

  describe('setLogger', () => {
    it('allows setting a custom logger', () => {
      const originalLogger = logger;
      const customLogger: Logger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        json: vi.fn(),
      };

      setLogger(customLogger);
      expect(logger).toBe(customLogger);

      setLogger(originalLogger);
    });
  });

  describe('createLogger options', () => {
    it('creates logger with default options', () => {
      const log = createLogger();
      expect(log).toBeDefined();
    });

    it('creates logger with verbose option', () => {
      const log = createLogger({ verbose: true });
      expect(log).toBeDefined();
    });

    it('creates logger with quiet option', () => {
      const log = createLogger({ quiet: true });
      expect(log).toBeDefined();
    });

    it('creates logger with noColor option', () => {
      const log = createLogger({ noColor: true });
      expect(log).toBeDefined();
    });

    it('creates logger with debug option for JSON output', () => {
      const log = createLogger({ debug: true });
      expect(log).toBeDefined();
    });

    it('creates logger with multiple options', () => {
      const log = createLogger({ verbose: true, noColor: true, debug: true });
      expect(log).toBeDefined();
    });
  });
});

describe('Error exit codes', () => {
  it('toExitCode(null) returns 0', () => {
    expect(toExitCode(null)).toBe(0);
  });

  it('toExitCode(undefined) returns 0', () => {
    expect(toExitCode(undefined)).toBe(0);
  });

  it('toExitCode(new WreckitError()) returns 1', () => {
    expect(toExitCode(new WreckitError('test', 'TEST'))).toBe(1);
  });

  it('toExitCode(new ConfigError()) returns 1', () => {
    expect(toExitCode(new ConfigError('config issue'))).toBe(1);
  });

  it('toExitCode(new InterruptedError()) returns 130', () => {
    expect(toExitCode(new InterruptedError())).toBe(130);
  });

  it('toExitCode(new Error("SIGINT")) returns 130', () => {
    expect(toExitCode(new Error('SIGINT'))).toBe(130);
  });

  it('toExitCode(new Error("interrupted")) returns 130', () => {
    expect(toExitCode(new Error('Operation was interrupted'))).toBe(130);
  });

  it('toExitCode(new Error("random")) returns 1', () => {
    expect(toExitCode(new Error('random error'))).toBe(1);
  });

  it('toExitCode with non-error returns 1', () => {
    expect(toExitCode('string error')).toBe(1);
    expect(toExitCode(42)).toBe(1);
    expect(toExitCode({})).toBe(1);
  });
});

describe('wrapError', () => {
  it('wraps Error with context', () => {
    const original = new Error('original message');
    const wrapped = wrapError(original, 'Failed to load');

    expect(wrapped).toBeInstanceOf(WreckitError);
    expect(wrapped.message).toBe('Failed to load: original message');
    expect(wrapped.code).toBe('WRAPPED_ERROR');
  });

  it('wraps WreckitError with context preserving code', () => {
    const original = new ConfigError('bad config');
    const wrapped = wrapError(original, 'Initialization failed');

    expect(wrapped).toBeInstanceOf(WreckitError);
    expect(wrapped.message).toBe('Initialization failed: bad config');
    expect(wrapped.code).toBe('CONFIG_ERROR');
  });

  it('wraps string with context', () => {
    const wrapped = wrapError('something went wrong', 'Operation failed');

    expect(wrapped).toBeInstanceOf(WreckitError);
    expect(wrapped.message).toBe('Operation failed: something went wrong');
    expect(wrapped.code).toBe('WRAPPED_ERROR');
  });
});

describe('isWreckitError', () => {
  it('returns true for WreckitError', () => {
    expect(isWreckitError(new WreckitError('test', 'TEST'))).toBe(true);
  });

  it('returns true for WreckitError subclasses', () => {
    expect(isWreckitError(new ConfigError('test'))).toBe(true);
    expect(isWreckitError(new InterruptedError())).toBe(true);
  });

  it('returns false for regular Error', () => {
    expect(isWreckitError(new Error('test'))).toBe(false);
  });

  it('returns false for non-errors', () => {
    expect(isWreckitError('string')).toBe(false);
    expect(isWreckitError(null)).toBe(false);
    expect(isWreckitError(undefined)).toBe(false);
    expect(isWreckitError({})).toBe(false);
  });
});
