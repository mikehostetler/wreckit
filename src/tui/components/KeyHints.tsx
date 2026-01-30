import React from "react";
import { Box, Text } from "ink";
import type { TuiState } from "../dashboard";

interface KeyHintsProps {
  width: number;
  viewMode: TuiState["viewMode"];
}

interface KeyHint {
  key: string;
  action: string;
}

const HINTS_BY_MODE: Record<TuiState["viewMode"], KeyHint[]> = {
  dashboard: [
    { key: "l", action: "logs" },
    { key: "t", action: "thoughts" },
    { key: "enter", action: "expand" },
    { key: "q", action: "quit" },
  ],
  logs: [
    { key: "l", action: "back" },
    { key: "j/k", action: "scroll" },
    { key: "g/G", action: "top/bottom" },
    { key: "q", action: "quit" },
  ],
  thoughts: [
    { key: "t", action: "back" },
    { key: "j/k", action: "scroll" },
    { key: "q", action: "quit" },
  ],
  "tool-detail": [
    { key: "enter", action: "back" },
    { key: "q", action: "quit" },
  ],
};

export function KeyHints({
  width,
  viewMode,
}: KeyHintsProps): React.ReactElement {
  const hints = HINTS_BY_MODE[viewMode];

  return (
    <Box width={width} justifyContent="flex-start">
      {hints.map((hint, index) => (
        <React.Fragment key={hint.key}>
          <Text dimColor>[{hint.key}]</Text>
          <Text> {hint.action}</Text>
          {index < hints.length - 1 && <Text>  </Text>}
        </React.Fragment>
      ))}
    </Box>
  );
}
