import React, { useState, useEffect, useCallback } from "react";
import { Box, Text, useInput, useStdout } from "ink";
import {
  StatusBar,
  ActiveContext,
  ItemsPane,
  Timeline,
  LogsPane,
  KeyHints,
  AgentActivityPane,
} from "./components";
import type { TuiState } from "./dashboard";
import { LAYOUT } from "./dashboard";

interface InkAppProps {
  subscribe: (cb: (state: TuiState) => void) => () => void;
  onQuit: () => void;
  initialState: TuiState;
}

export function InkApp({
  subscribe,
  onQuit,
  initialState,
}: InkAppProps): React.ReactElement {
  const [state, setState] = useState<TuiState>(initialState);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [autoScroll, setAutoScroll] = useState(true);
  const { stdout } = useStdout();

  const width = stdout?.columns ?? 80;
  const height = stdout?.rows ?? 24;

  useEffect(() => {
    const unsubscribe = subscribe((newState) => {
      setState(newState);
      if (autoScroll) {
        setScrollOffset(0);
      }
    });
    return unsubscribe;
  }, [subscribe, autoScroll]);

  useEffect(() => {
    const timer = setInterval(() => {
      setState((prev) => ({ ...prev }));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const setViewMode = useCallback(
    (mode: TuiState["viewMode"]) => {
      setState((prev) => ({ ...prev, viewMode: mode }));
      setScrollOffset(0);
      setAutoScroll(true);
    },
    [],
  );

  const handleScroll = useCallback(
    (direction: "up" | "down" | "pageUp" | "pageDown" | "top" | "bottom") => {
      const contentHeight = height - LAYOUT.HEADER_HEIGHT - LAYOUT.FOOTER_HEIGHT - 4;
      const contentLength =
        state.viewMode === "logs"
          ? state.logs.length
          : state.viewMode === "thoughts"
            ? (state.activityByItem[state.currentItem ?? ""]?.thoughts.length ?? 0)
            : 0;
      const maxOffset = Math.max(0, contentLength - contentHeight);

      setScrollOffset((prev) => {
        let next = prev;
        switch (direction) {
          case "up":
            next = Math.min(prev + 1, maxOffset);
            break;
          case "down":
            next = Math.max(prev - 1, 0);
            break;
          case "pageUp":
            next = Math.min(prev + contentHeight, maxOffset);
            break;
          case "pageDown":
            next = Math.max(prev - contentHeight, 0);
            break;
          case "top":
            next = maxOffset;
            break;
          case "bottom":
            next = 0;
            break;
        }

        setAutoScroll(next === 0);
        return next;
      });
    },
    [height, state.logs.length, state.viewMode, state.activityByItem, state.currentItem],
  );

  useInput((input, key) => {
    if (input === "q" || (key.ctrl && input === "c")) {
      onQuit();
    } else if (input === "l") {
      if (state.viewMode === "logs") {
        setViewMode("dashboard");
      } else {
        setViewMode("logs");
      }
    } else if (input === "t") {
      if (state.viewMode === "thoughts") {
        setViewMode("dashboard");
      } else {
        setViewMode("thoughts");
      }
    } else if (key.return) {
      if (state.viewMode === "tool-detail") {
        setViewMode("dashboard");
      } else if (state.viewMode === "dashboard") {
        setViewMode("tool-detail");
      }
    } else if (input === "j" || key.downArrow) {
      handleScroll("down");
    } else if (input === "k" || key.upArrow) {
      handleScroll("up");
    } else if (key.pageDown) {
      handleScroll("pageDown");
    } else if (key.pageUp) {
      handleScroll("pageUp");
    } else if (input === "g") {
      handleScroll("top");
    } else if (input === "G") {
      handleScroll("bottom");
    }
  });

  const statusBarHeight = 1;
  const activeContextHeight = 3;
  const keyHintsHeight = LAYOUT.FOOTER_HEIGHT;
  const mainHeight = Math.max(
    LAYOUT.MIN_MAIN_HEIGHT,
    height - statusBarHeight - activeContextHeight - keyHintsHeight - 2,
  );

  const leftPaneWidth = Math.floor(width * LAYOUT.ITEMS_WIDTH_RATIO);
  const rightPaneWidth = width - leftPaneWidth - 1;

  const renderMainContent = () => {
    switch (state.viewMode) {
      case "logs":
        return (
          <Box height={mainHeight} paddingLeft={1}>
            <LogsPane
              logs={state.logs}
              width={width - 2}
              height={mainHeight}
              scrollOffset={scrollOffset}
            />
          </Box>
        );

      case "thoughts": {
        const thoughts = state.activityByItem[state.currentItem ?? ""]?.thoughts ?? [];
        return (
          <Box height={mainHeight} paddingLeft={1} flexDirection="column">
            <Box>
              <Text dimColor>─ Thoughts ─{"─".repeat(Math.max(0, width - 16))}</Text>
            </Box>
            {thoughts.slice(-(mainHeight - 1)).map((thought, idx) => (
              <Box key={idx}>
                <Text dimColor wrap="truncate-end">{thought.slice(0, width - 4)}</Text>
              </Box>
            ))}
          </Box>
        );
      }

      case "tool-detail": {
        const activity = state.activityByItem[state.currentItem ?? ""];
        const lastTool = activity?.tools[activity.tools.length - 1];
        return (
          <Box height={mainHeight} paddingLeft={1} flexDirection="column">
            {lastTool ? (
              <>
                <Box>
                  <Text color="cyan" bold>{lastTool.toolName}</Text>
                  <Text dimColor> ({lastTool.status})</Text>
                </Box>
                <Box marginTop={1}>
                  <Text dimColor>Input:</Text>
                </Box>
                <Box>
                  <Text wrap="truncate-end">{JSON.stringify(lastTool.input, null, 2).slice(0, 500)}</Text>
                </Box>
                {lastTool.result && (
                  <>
                    <Box marginTop={1}>
                      <Text dimColor>Result:</Text>
                    </Box>
                    <Box>
                      <Text wrap="truncate-end">{String(lastTool.result).slice(0, 500)}</Text>
                    </Box>
                  </>
                )}
              </>
            ) : (
              <Text dimColor>No tool executions yet</Text>
            )}
          </Box>
        );
      }

      case "dashboard":
      default:
        return (
          <Box height={mainHeight}>
            <Box flexDirection="column" width={leftPaneWidth}>
              <ItemsPane
                state={state}
                width={leftPaneWidth}
                height={mainHeight}
              />
            </Box>
            <Box flexDirection="column" width={rightPaneWidth} paddingLeft={1}>
              <Timeline
                events={state.timeline}
                width={rightPaneWidth - 1}
                height={mainHeight}
              />
            </Box>
          </Box>
        );
    }
  };

  return (
    <Box flexDirection="column" width={width} height={height}>
      <StatusBar state={state} width={width} />
      <ActiveContext state={state} width={width} />
      {renderMainContent()}
      <KeyHints width={width} viewMode={state.viewMode} />
    </Box>
  );
}
