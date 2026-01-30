import { vi } from "bun:test";
import type {
  TuiState,
  ToolExecution,
  AgentActivityForItem,
} from "../dashboard";
import { createTuiState } from "../dashboard";
import type { IndexItem } from "../../schemas";

/**
 * Creates a mock TuiState with optional overrides
 */
export function createMockTuiState(
  overrides: Partial<TuiState> = {},
): TuiState {
  const items: IndexItem[] = [
    {
      id: "foundation/001-core-types",
      title: "Core Types",
      state: "done",
    },
    {
      id: "features/001-auth",
      title: "Authentication",
      state: "implementing",
    },
    {
      id: "features/002-user-profile",
      title: "User Profile",
      state: "idea",
    },
  ];

  const baseState = createTuiState(items);

  return {
    ...baseState,
    ...overrides,
  };
}

/**
 * Creates a mock stdout object with configurable dimensions
 */
export function createMockStdout(columns: number = 80, rows: number = 24) {
  return {
    columns,
    rows,
    write: vi.fn(),
  };
}

/**
 * Creates a mock ToolExecution object
 */
export function createMockToolExecution(
  overrides: Partial<ToolExecution> = {},
): ToolExecution {
  return {
    toolUseId: "tool-123",
    toolName: "Read",
    input: { path: "/path/to/file" },
    status: "running",
    startedAt: new Date(),
    ...overrides,
  };
}

/**
 * Creates a mock AgentActivityForItem object
 */
export function createMockAgentActivity(
  overrides: Partial<AgentActivityForItem> = {},
): AgentActivityForItem {
  return {
    thoughts: ["Thinking about the problem"],
    tools: [createMockToolExecution()],
    ...overrides,
  };
}

/**
 * Mock implementation of useInput hook that allows test control
 */
export function mockUseInput() {
  let inputHandler: ((input: string, key: any) => void) | null = null;

  const mockUseInput = (handler: (input: string, key: any) => void) => {
    inputHandler = handler;
  };

  return {
    mockUseInput,
    simulateInput: (input: string, key: any = {}) => {
      if (inputHandler) {
        inputHandler(input, key);
      }
    },
  };
}

/**
 * Mock implementation of useStdout hook
 */
export function mockUseStdout(stdout: { columns: number; rows: number }) {
  const mockUseStdout = () => ({ stdout });
  return { mockUseStdout };
}

/**
 * Creates a mock IndexItem for testing
 */
export function createMockIndexItem(
  overrides: Partial<IndexItem> = {},
): IndexItem {
  return {
    id: "foundation/001-test",
    title: "Test Item",
    state: "idea",
    ...overrides,
  };
}
