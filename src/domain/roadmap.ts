/**
 * Roadmap domain module for parsing and manipulating ROADMAP.md files.
 *
 * The ROADMAP.md format is designed to be both human-readable and machine-parseable.
 * It supports three sections: Active Milestones, Backlog, and Completed.
 *
 * Example format:
 * ```markdown
 * # Roadmap
 *
 * ## Active Milestones
 *
 * ### [M1] Milestone Title
 * **Status:** in-progress
 * **Target:** Q1 2026
 * **Strategic Goal:** Why this matters
 *
 * #### Objectives
 * - [ ] Objective 1
 * - [x] Completed objective
 *
 * ## Backlog
 * ...
 *
 * ## Completed
 * ...
 * ```
 */

export interface RoadmapObjective {
  text: string;
  completed: boolean;
}

export interface RoadmapMilestone {
  id: string;
  title: string;
  status: "in-progress" | "planned" | "done";
  target?: string;
  strategicGoal?: string;
  objectives: RoadmapObjective[];
}

export interface Roadmap {
  activeMilestones: RoadmapMilestone[];
  backlog: RoadmapMilestone[];
  completed: RoadmapMilestone[];
}

type MilestoneStatus = RoadmapMilestone["status"];

/**
 * Parse a milestone header line like "### [M1] Milestone Title"
 */
function parseMilestoneHeader(
  line: string
): { id: string; title: string } | null {
  const match = line.match(/^###\s+\[([^\]]+)\]\s+(.+)$/);
  if (!match) return null;
  return { id: match[1], title: match[2].trim() };
}

/**
 * Parse a status line like "**Status:** in-progress"
 */
function parseStatusLine(line: string): MilestoneStatus | null {
  const match = line.match(/^\*\*Status:\*\*\s*(.+)$/i);
  if (!match) return null;
  const status = match[1].trim().toLowerCase();
  if (status === "in-progress" || status === "planned" || status === "done") {
    return status;
  }
  return null;
}

/**
 * Parse a target line like "**Target:** Q1 2026"
 */
function parseTargetLine(line: string): string | null {
  const match = line.match(/^\*\*Target:\*\*\s*(.+)$/i);
  if (!match) return null;
  return match[1].trim();
}

/**
 * Parse a strategic goal line like "**Strategic Goal:** Why this matters"
 */
function parseStrategicGoalLine(line: string): string | null {
  const match = line.match(/^\*\*Strategic Goal:\*\*\s*(.+)$/i);
  if (!match) return null;
  return match[1].trim();
}

/**
 * Parse a checkbox objective like "- [ ] Objective text" or "- [x] Done"
 */
function parseObjectiveLine(line: string): RoadmapObjective | null {
  const match = line.match(/^-\s+\[([ xX])\]\s+(.+)$/);
  if (!match) return null;
  return {
    completed: match[1].toLowerCase() === "x",
    text: match[2].trim(),
  };
}

/**
 * Identify which section we're in based on heading
 */
function parseSection(
  line: string
): "active" | "backlog" | "completed" | null {
  const trimmed = line.trim().toLowerCase();
  if (trimmed === "## active milestones" || trimmed === "## active") {
    return "active";
  }
  if (trimmed === "## backlog") {
    return "backlog";
  }
  if (trimmed === "## completed") {
    return "completed";
  }
  return null;
}

/**
 * Parse ROADMAP.md content into a structured Roadmap object.
 *
 * @param content - The raw markdown content of ROADMAP.md
 * @returns Parsed Roadmap structure
 */
export function parseRoadmap(content: string): Roadmap {
  const roadmap: Roadmap = {
    activeMilestones: [],
    backlog: [],
    completed: [],
  };

  const lines = content.split("\n");
  let currentSection: "active" | "backlog" | "completed" | null = null;
  let currentMilestone: RoadmapMilestone | null = null;

  const flushMilestone = () => {
    if (currentMilestone && currentSection) {
      switch (currentSection) {
        case "active":
          roadmap.activeMilestones.push(currentMilestone);
          break;
        case "backlog":
          roadmap.backlog.push(currentMilestone);
          break;
        case "completed":
          roadmap.completed.push(currentMilestone);
          break;
      }
      currentMilestone = null;
    }
  };

  for (const line of lines) {
    const trimmed = line.trim();

    // Check for section change
    const section = parseSection(trimmed);
    if (section) {
      flushMilestone();
      currentSection = section;
      continue;
    }

    // Check for new milestone
    const milestoneHeader = parseMilestoneHeader(trimmed);
    if (milestoneHeader) {
      flushMilestone();
      currentMilestone = {
        id: milestoneHeader.id,
        title: milestoneHeader.title,
        status: "planned", // default status
        objectives: [],
      };
      continue;
    }

    // Parse milestone metadata if we're in a milestone
    if (currentMilestone) {
      const status = parseStatusLine(trimmed);
      if (status) {
        currentMilestone.status = status;
        continue;
      }

      const target = parseTargetLine(trimmed);
      if (target) {
        currentMilestone.target = target;
        continue;
      }

      const strategicGoal = parseStrategicGoalLine(trimmed);
      if (strategicGoal) {
        currentMilestone.strategicGoal = strategicGoal;
        continue;
      }

      const objective = parseObjectiveLine(trimmed);
      if (objective) {
        currentMilestone.objectives.push(objective);
        continue;
      }
    }
  }

  // Flush any remaining milestone
  flushMilestone();

  return roadmap;
}

/**
 * Serialize a Roadmap structure back to markdown format.
 *
 * @param roadmap - The Roadmap structure to serialize
 * @returns Markdown string
 */
export function serializeRoadmap(roadmap: Roadmap): string {
  const lines: string[] = [];

  lines.push("# Roadmap");
  lines.push("");

  const serializeMilestone = (milestone: RoadmapMilestone) => {
    lines.push(`### [${milestone.id}] ${milestone.title}`);
    lines.push(`**Status:** ${milestone.status}`);
    if (milestone.target) {
      lines.push(`**Target:** ${milestone.target}`);
    }
    if (milestone.strategicGoal) {
      lines.push(`**Strategic Goal:** ${milestone.strategicGoal}`);
    }
    lines.push("");
    if (milestone.objectives.length > 0) {
      lines.push("#### Objectives");
      for (const obj of milestone.objectives) {
        const checkbox = obj.completed ? "[x]" : "[ ]";
        lines.push(`- ${checkbox} ${obj.text}`);
      }
      lines.push("");
    }
  };

  if (roadmap.activeMilestones.length > 0) {
    lines.push("## Active Milestones");
    lines.push("");
    for (const milestone of roadmap.activeMilestones) {
      serializeMilestone(milestone);
    }
  }

  if (roadmap.backlog.length > 0) {
    lines.push("## Backlog");
    lines.push("");
    for (const milestone of roadmap.backlog) {
      serializeMilestone(milestone);
    }
  }

  if (roadmap.completed.length > 0) {
    lines.push("## Completed");
    lines.push("");
    for (const milestone of roadmap.completed) {
      serializeMilestone(milestone);
    }
  }

  return lines.join("\n").trim() + "\n";
}

/**
 * Validate ROADMAP.md content for correct format.
 *
 * @param content - The raw markdown content to validate
 * @returns Validation result with errors if any
 */
export function validateRoadmap(content: string): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // Check for basic structure
  if (!content.trim()) {
    errors.push("ROADMAP.md is empty");
    return { valid: false, errors };
  }

  // Check for at least one section header
  const hasActiveSection =
    content.toLowerCase().includes("## active milestones") ||
    content.toLowerCase().includes("## active");
  const hasBacklogSection = content.toLowerCase().includes("## backlog");
  const hasCompletedSection = content.toLowerCase().includes("## completed");

  if (!hasActiveSection && !hasBacklogSection && !hasCompletedSection) {
    errors.push(
      "ROADMAP.md must have at least one section: Active Milestones, Backlog, or Completed"
    );
  }

  // Parse and check for milestones
  const roadmap = parseRoadmap(content);
  const totalMilestones =
    roadmap.activeMilestones.length +
    roadmap.backlog.length +
    roadmap.completed.length;

  if (totalMilestones === 0) {
    errors.push("ROADMAP.md must have at least one milestone");
  }

  // Check milestone IDs are unique
  const allMilestones = [
    ...roadmap.activeMilestones,
    ...roadmap.backlog,
    ...roadmap.completed,
  ];
  const idSet = new Set<string>();
  for (const milestone of allMilestones) {
    if (idSet.has(milestone.id)) {
      errors.push(`Duplicate milestone ID: ${milestone.id}`);
    }
    idSet.add(milestone.id);
  }

  // Check each milestone has a title
  for (const milestone of allMilestones) {
    if (!milestone.title.trim()) {
      errors.push(`Milestone [${milestone.id}] has no title`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Extract all pending (unchecked) objectives from active milestones.
 * These can be converted to wreckit items.
 *
 * @param roadmap - The parsed Roadmap structure
 * @returns Array of pending objectives with milestone context
 */
export function extractPendingObjectives(
  roadmap: Roadmap
): Array<{
  milestoneId: string;
  milestoneTitle: string;
  objective: string;
  index: number;
}> {
  const pending: Array<{
    milestoneId: string;
    milestoneTitle: string;
    objective: string;
    index: number;
  }> = [];

  for (const milestone of roadmap.activeMilestones) {
    for (let i = 0; i < milestone.objectives.length; i++) {
      const obj = milestone.objectives[i];
      if (!obj.completed) {
        pending.push({
          milestoneId: milestone.id,
          milestoneTitle: milestone.title,
          objective: obj.text,
          index: i,
        });
      }
    }
  }

  return pending;
}

/**
 * Extract all objectives (including completed) from active milestones.
 *
 * @param roadmap - The parsed Roadmap structure
 * @returns Array of all objectives with milestone context and completion status
 */
export function extractAllObjectives(
  roadmap: Roadmap
): Array<{
  milestoneId: string;
  milestoneTitle: string;
  objective: string;
  completed: boolean;
  index: number;
}> {
  const objectives: Array<{
    milestoneId: string;
    milestoneTitle: string;
    objective: string;
    completed: boolean;
    index: number;
  }> = [];

  for (const milestone of roadmap.activeMilestones) {
    for (let i = 0; i < milestone.objectives.length; i++) {
      const obj = milestone.objectives[i];
      objectives.push({
        milestoneId: milestone.id,
        milestoneTitle: milestone.title,
        objective: obj.text,
        completed: obj.completed,
        index: i,
      });
    }
  }

  return objectives;
}
