/**
 * Remotion composition for Wreckit Issue #004:
 * Fix plan template to match validator requirements
 *
 * This composition visualizes the bug fix with smooth animations
 */

import {
  AbsoluteFill,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
  spring,
} from "remotion";

// Color constants
const COLORS = {
  background: "#0f172a",
  text: "#f1f5f9",
  blue: "#3b82f6",
  red: "#ef4444",
  green: "#22c55e",
  yellow: "#eab308",
};

interface Section {
  name: string;
  status: "match" | "mismatch" | "missing";
}

// Template sections (before fix)
const BEFORE_SECTIONS: Section[] = [
  { name: "Header", status: "match" },
  { name: "Implementation Plan Title", status: "missing" },
  { name: "Overview", status: "match" },
  { name: "Current State Analysis", status: "mismatch" },
  { name: "Desired End State", status: "match" },
  { name: "What We're NOT Doing", status: "match" },
  { name: "Implementation Approach", status: "match" },
  { name: "Phases", status: "missing" },
  { name: "Testing Strategy", status: "match" },
];

// Template sections (after fix)
const AFTER_SECTIONS: Section[] = [
  { name: "Header", status: "match" },
  { name: "Implementation Plan Title", status: "match" },
  { name: "Overview", status: "match" },
  { name: "Current State", status: "match" },
  { name: "Desired End State", status: "match" },
  { name: "What We're NOT Doing", status: "match" },
  { name: "Implementation Approach", status: "match" },
  { name: "Phases", status: "match" },
  { name: "Testing Strategy", status: "match" },
];

export const PlanTemplateFix = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  // Scene timing (in frames)
  const INTRO_END = 60;
  const PROBLEM_END = 240;
  const FIX_END = 360;
  const SUCCESS_END = 480;

  // Opacity animations
  const introOpacity = interpolate(frame, [0, 30], [0, 1], {
    extrapolateRight: "clamp",
  });

  const problemOpacity = interpolate(
    frame,
    [INTRO_END - 30, INTRO_END, PROBLEM_END - 30, PROBLEM_END],
    [0, 1, 1, 0],
    { extrapolateRight: "clamp" },
  );

  const fixOpacity = interpolate(
    frame,
    [PROBLEM_END - 30, PROBLEM_END, FIX_END - 30, FIX_END],
    [0, 1, 1, 0],
    { extrapolateRight: "clamp" },
  );

  const successOpacity = interpolate(
    frame,
    [FIX_END - 30, FIX_END, SUCCESS_END - 30],
    [0, 1, 1],
    { extrapolateRight: "clamp" },
  );

  // Spring animation for sections
  const sectionScale = spring({
    frame,
    fps,
    config: {
      damping: 100,
      stiffness: 200,
      mass: 0.5,
    },
  });

  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.background }}>
      {/* Intro Scene */}
      <div
        style={{
          opacity: introOpacity,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          position: "absolute",
          inset: 0,
        }}
      >
        <h1
          style={{
            fontSize: 80,
            fontWeight: "bold",
            color: COLORS.blue,
            margin: 0,
            marginBottom: 20,
          }}
        >
          Issue #004
        </h1>
        <p
          style={{
            fontSize: 48,
            color: COLORS.text,
            margin: 0,
          }}
        >
          Plan Template Bug Fix
        </p>
      </div>

      {/* Problem Scene */}
      <div
        style={{
          opacity: problemOpacity,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          position: "absolute",
          inset: 0,
          padding: 60,
        }}
      >
        <h2
          style={{
            fontSize: 56,
            color: COLORS.red,
            margin: 0,
            marginBottom: 40,
            textAlign: "center",
          }}
        >
          THE PROBLEM
        </h2>

        <div
          style={{
            display: "flex",
            gap: 60,
            width: "100%",
            maxWidth: 1400,
          }}
        >
          {/* Before list */}
          <div style={{ flex: 1 }}>
            <h3
              style={{
                fontSize: 32,
                color: COLORS.text,
                marginBottom: 20,
              }}
            >
              Template Has:
            </h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {BEFORE_SECTIONS.map((section, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "12px 16px",
                    backgroundColor:
                      section.status === "mismatch"
                        ? "rgba(239, 68, 68, 0.2)"
                        : section.status === "missing"
                          ? "rgba(239, 68, 68, 0.1)"
                          : "transparent",
                    borderRadius: 8,
                    transform: `scale(${sectionScale})`,
                  }}
                >
                  <span style={{ fontSize: 28 }}>
                    {section.status === "match" ? "✓" : "✗"}
                  </span>
                  <span
                    style={{
                      fontSize: 24,
                      color:
                        section.status === "match" ? COLORS.green : COLORS.red,
                    }}
                  >
                    {section.name}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Validator expects */}
          <div style={{ flex: 1 }}>
            <h3
              style={{
                fontSize: 32,
                color: COLORS.text,
                marginBottom: 20,
              }}
            >
              Validator Expects:
            </h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {AFTER_SECTIONS.map((section, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "12px 16px",
                    backgroundColor: "rgba(34, 197, 94, 0.1)",
                    borderRadius: 8,
                  }}
                >
                  <span style={{ fontSize: 28, color: COLORS.green }}>✓</span>
                  <span style={{ fontSize: 24, color: COLORS.text }}>
                    {section.name}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Error message */}
        <div
          style={{
            marginTop: 40,
            padding: "20px 40px",
            backgroundColor: "rgba(239, 68, 68, 0.2)",
            borderRadius: 12,
            border: `2px solid ${COLORS.red}`,
          }}
        >
          <p
            style={{
              fontSize: 28,
              color: COLORS.red,
              margin: 0,
              textAlign: "center",
            }}
          >
            ❌ Validation Error: Missing sections and mismatched names!
          </p>
        </div>
      </div>

      {/* Fix Scene */}
      <div
        style={{
          opacity: fixOpacity,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          position: "absolute",
          inset: 0,
          padding: 60,
        }}
      >
        <h2
          style={{
            fontSize: 56,
            color: COLORS.green,
            margin: 0,
            marginBottom: 40,
          }}
        >
          THE FIX
        </h2>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 30,
            width: "100%",
            maxWidth: 1000,
          }}
        >
          {/* Change 1 */}
          <div
            style={{
              padding: "24px 32px",
              backgroundColor: "rgba(59, 130, 246, 0.1)",
              borderRadius: 12,
              border: `2px solid ${COLORS.blue}`,
            }}
          >
            <h3
              style={{
                fontSize: 32,
                color: COLORS.blue,
                margin: "0 0 16px 0",
              }}
            >
              1. Rename Section
            </h3>
            <div
              style={{
                fontSize: 24,
                fontFamily: "monospace",
                color: COLORS.text,
                lineHeight: 1.6,
              }}
            >
              <span style={{ color: COLORS.red }}>
                ## Current State Analysis
              </span>
              <span style={{ margin: "0 16px" }}>→</span>
              <span style={{ color: COLORS.green }}>## Current State</span>
            </div>
          </div>

          {/* Change 2 */}
          <div
            style={{
              padding: "24px 32px",
              backgroundColor: "rgba(59, 130, 246, 0.1)",
              borderRadius: 12,
              border: `2px solid ${COLORS.blue}`,
            }}
          >
            <h3
              style={{
                fontSize: 32,
                color: COLORS.blue,
                margin: "0 0 16px 0",
              }}
            >
              2. Wrap Phases in Container
            </h3>
            <div
              style={{
                fontSize: 24,
                fontFamily: "monospace",
                color: COLORS.text,
                lineHeight: 1.6,
              }}
            >
              <div style={{ color: COLORS.red }}>### Phase 1: Setup</div>
              <div style={{ color: COLORS.green, marginTop: 8 }}>
                ## Phases
                <br />
                <span style={{ marginLeft: 16 }}>### Phase 1: Setup</span>
              </div>
            </div>
          </div>

          {/* Change 3 */}
          <div
            style={{
              padding: "24px 32px",
              backgroundColor: "rgba(59, 130, 246, 0.1)",
              borderRadius: 12,
              border: `2px solid ${COLORS.blue}`,
            }}
          >
            <h3
              style={{
                fontSize: 32,
                color: COLORS.blue,
                margin: "0 0 16px 0",
              }}
            >
              3. Add Missing Section
            </h3>
            <div
              style={{
                fontSize: 24,
                fontFamily: "monospace",
                color: COLORS.green,
                lineHeight: 1.6,
              }}
            >
              + ## Implementation Plan Title
            </div>
          </div>
        </div>
      </div>

      {/* Success Scene */}
      <div
        style={{
          opacity: successOpacity,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          position: "absolute",
          inset: 0,
          padding: 60,
        }}
      >
        <div
          style={{
            fontSize: 72,
            marginBottom: 30,
          }}
        >
          ✓
        </div>
        <h2
          style={{
            fontSize: 56,
            color: COLORS.green,
            margin: "0 0 40px 0",
          }}
        >
          SUCCESS!
        </h2>

        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <p
            style={{
              fontSize: 32,
              color: COLORS.text,
              margin: 0,
              textAlign: "center",
            }}
          >
            ✓ All sections match validator requirements
          </p>
          <p
            style={{
              fontSize: 32,
              color: COLORS.text,
              margin: 0,
              textAlign: "center",
            }}
          >
            ✓ Phases properly wrapped in container
          </p>
          <p
            style={{
              fontSize: 32,
              color: COLORS.text,
              margin: 0,
              textAlign: "center",
            }}
          >
            ✓ Plans now pass validation automatically
          </p>
        </div>

        <div
          style={{
            marginTop: 60,
            padding: "20px 40px",
            backgroundColor: "rgba(34, 197, 94, 0.2)",
            borderRadius: 12,
            border: `2px solid ${COLORS.green}`,
          }}
        >
          <p
            style={{
              fontSize: 28,
              color: COLORS.green,
              margin: 0,
              textAlign: "center",
            }}
          >
            File updated: src/prompts/plan.md
          </p>
        </div>
      </div>
    </AbsoluteFill>
  );
};

// Configuration for the composition
PlanTemplateFix.durationInFrames = 480; // 16 seconds at 30fps
PlanTemplateFix.fps = 30;
PlanTemplateFix.width = 1920;
PlanTemplateFix.height = 1080;
