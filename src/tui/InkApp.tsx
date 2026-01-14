import React, { useState, useEffect, useCallback } from "react";
import { Box, useInput, useStdout } from "ink";
import { Header, ItemsPane, LogsPane, Footer, ActiveItemPane, AgentActivityPane } from "./components";
import type { TuiState } from "./dashboard";

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
  const [showLogs, setShowLogs] = useState(false);
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

  const handleScroll = useCallback(
    (direction: "up" | "down" | "pageUp" | "pageDown" | "top" | "bottom") => {
      const logsHeight = height - 10;
      const maxOffset = Math.max(0, state.logs.length - logsHeight);

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
            next = Math.min(prev + logsHeight, maxOffset);
            break;
          case "pageDown":
            next = Math.max(prev - logsHeight, 0);
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
    [height, state.logs.length]
  );

  useInput((input, key) => {
    if (input === "q" || (key.ctrl && input === "c")) {
      onQuit();
    } else if (input === "l") {
      setShowLogs((prev) => !prev);
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

  const headerHeight = 5;
  const footerHeight = 4;
  const mainHeight = Math.max(1, height - headerHeight - footerHeight);

  const leftPaneWidth = Math.floor(width * 0.4);
  const rightPaneWidth = width - leftPaneWidth - 3;

  return (
    <Box flexDirection="column" width={width} height={height}>
      <Header state={state} width={width} />

      {showLogs ? (
        <Box height={mainHeight}>
          <Box flexDirection="column" width={width - 4} paddingLeft={1}>
            <LogsPane
              logs={state.logs}
              width={width - 4}
              height={mainHeight}
              scrollOffset={scrollOffset}
            />
          </Box>
        </Box>
      ) : (
        <Box height={mainHeight}>
          <Box flexDirection="column" width={leftPaneWidth} paddingLeft={1}>
            <ItemsPane
              state={state}
              width={leftPaneWidth}
              height={mainHeight}
            />
          </Box>
          <Box
            flexDirection="column"
            width={rightPaneWidth}
            borderStyle="single"
            borderLeft
            borderTop={false}
            borderRight={false}
            borderBottom={false}
            paddingLeft={1}
          >
            <Box height={4}>
              <ActiveItemPane state={state} width={rightPaneWidth - 2} />
            </Box>
            <Box height={mainHeight - 4}>
              <AgentActivityPane 
                state={state} 
                width={rightPaneWidth - 2} 
                height={mainHeight - 4} 
              />
            </Box>
          </Box>
        </Box>
      )}

      <Footer state={state} width={width} showLogs={showLogs} />
    </Box>
  );
}
