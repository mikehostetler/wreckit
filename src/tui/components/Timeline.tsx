import React from "react";
import { Box, Text } from "ink";
import type { TimelineEvent } from "../dashboard";

interface TimelineProps {
  events: TimelineEvent[];
  width: number;
  height: number;
}

export function Timeline({
  events,
  width,
  height,
}: TimelineProps): React.ReactElement {
  const headerLine = "─ Timeline " + "─".repeat(Math.max(0, width - 12));
  const contentHeight = height - 1;
  const visibleEvents = events.slice(-contentHeight);

  return (
    <Box flexDirection="column" width={width} height={height}>
      <Text>{headerLine}</Text>
      {visibleEvents.map((event, idx) => (
        <TimelineRow key={idx} event={event} width={width} />
      ))}
    </Box>
  );
}

function TimelineRow({
  event,
  width,
}: {
  event: TimelineEvent;
  width: number;
}): React.ReactElement {
  const timestamp = formatTime(event.timestamp);
  const { icon, color } = getEventStyle(event.type);
  const prefixLen = timestamp.length + 1 + 2;
  const maxSummaryLen = width - prefixLen;
  const summary = truncate(event.summary, maxSummaryLen);

  return (
    <Box>
      <Text dimColor>{timestamp} </Text>
      <Text color={color}>{icon} </Text>
      <Text>{summary}</Text>
    </Box>
  );
}

function formatTime(date: Date): string {
  const hh = date.getHours().toString().padStart(2, "0");
  const mm = date.getMinutes().toString().padStart(2, "0");
  const ss = date.getSeconds().toString().padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

function getEventStyle(type: TimelineEvent["type"]): {
  icon: string;
  color: string;
} {
  switch (type) {
    case "phase_change":
      return { icon: "→", color: "cyan" };
    case "tool_start":
      return { icon: "▶", color: "yellow" };
    case "tool_complete":
      return { icon: "✓", color: "green" };
    case "tool_error":
      return { icon: "✗", color: "red" };
    case "decision":
      return { icon: "📋", color: "blue" };
  }
}

function truncate(str: string, maxLen: number): string {
  if (maxLen <= 0) return "";
  if (str.length > maxLen) {
    return str.slice(0, maxLen - 1) + "…";
  }
  return str;
}
