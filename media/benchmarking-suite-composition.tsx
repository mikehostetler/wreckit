import {
  AbsoluteFill,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
  spring,
  Sequence
} from "remotion";
import { useMemo } from "react";

// Helper component for displaying metrics
const MetricBox = ({
  label,
  value,
  color,
  delay
}: {
  label: string;
  value: string;
  color: string;
  delay: number;
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const opacity = interpolate(
    frame,
    [delay, delay + 15],
    [0, 1],
    { extrapolateRight: "clamp" }
  );

  const scale = spring({
    frame: frame - delay,
    fps,
    config: { damping: 12, stiffness: 80 }
  });

  return (
    <div
      style={{
        opacity,
        transform: `scale(${scale})`,
        backgroundColor: `${color}20`,
        border: `2px solid ${color}`,
        borderRadius: 8,
        padding: 20,
        margin: 10,
        minWidth: 200,
        textAlign: "center"
      }}
    >
      <div style={{ fontSize: 24, color: "#333", fontWeight: "bold" }}>
        {label}
      </div>
      <div style={{ fontSize: 32, color, marginTop: 10, fontWeight: "bold" }}>
        {value}
      </div>
    </div>
  );
};

// Helper component for progress bars
const ProgressBar = ({
  progress,
  color,
  label,
  delay
}: {
  progress: number;
  color: string;
  label: string;
  delay: number;
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const width = interpolate(
    frame,
    [delay, delay + 30],
    [0, progress],
    { extrapolateRight: "clamp" }
  );

  const opacity = interpolate(
    frame,
    [delay, delay + 10],
    [0, 1],
    { extrapolateRight: "clamp" }
  );

  return (
    <div style={{ opacity, margin: 15 }}>
      <div style={{ fontSize: 20, color: "#333", marginBottom: 8 }}>
        {label}
      </div>
      <div
        style={{
          width: "100%",
          height: 30,
          backgroundColor: "#f0f0f0",
          borderRadius: 15,
          overflow: "hidden",
          border: "2px solid #333"
        }}
      >
        <div
          style={{
            width: `${width}%`,
            height: "100%",
            backgroundColor: color,
            transition: "width 0.3s ease"
          }}
        />
      </div>
      <div style={{ fontSize: 18, color: "#666", marginTop: 5 }}>
        {Math.round(width)}%
      </div>
    </div>
  );
};

// Format badge component
const FormatBadge = ({
  name,
  color,
  delay
}: {
  name: string;
  color: string;
  delay: number;
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const scale = spring({
    frame: frame - delay,
    fps,
    config: { damping: 15, stiffness: 100 }
  });

  const opacity = interpolate(
    frame,
    [delay, delay + 15],
    [0, 1],
    { extrapolateRight: "clamp" }
  );

  return (
    <div
      style={{
        opacity,
        transform: `scale(${scale})`,
        backgroundColor: color,
        color: "white",
        padding: "15px 30px",
        borderRadius: 10,
        fontSize: 28,
        fontWeight: "bold",
        margin: 10,
        boxShadow: `0 4px 6px ${color}40`
      }}
    >
      {name}
    </div>
  );
};

export const BenchmarkingSuiteComposition = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  // Calculate overall progress for background
  const bgOpacity = interpolate(
    frame,
    [0, 30],
    [0, 0.05],
    { extrapolateRight: "clamp" }
  );

  return (
    <AbsoluteFill
      style={{
        backgroundColor: "#ffffff",
        fontFamily: "Arial, sans-serif"
      }}
    >
      {/* Background gradient animation */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `linear-gradient(135deg,
            rgba(59, 130, 246, ${bgOpacity}) 0%,
            rgba(147, 51, 234, ${bgOpacity}) 100%)`
        }}
      />

      {/* Title Sequence - First 60 frames */}
      <Sequence from={0} durationInFrames={60}>
        <AbsoluteFill
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center"
          }}
        >
          {(() => {
            const titleOpacity = interpolate(frame, [0, 20], [0, 1]);
            const titleScale = spring({ frame, fps, config: { damping: 15, stiffness: 100 } });

            return (
              <div
                style={{
                  opacity: titleOpacity,
                  transform: `scale(${titleScale})`,
                  textAlign: "center"
                }}
              >
                <div
                  style={{
                    fontSize: 80,
                    fontWeight: "bold",
                    color: "#1e40af",
                    marginBottom: 20
                  }}
                >
                  Benchmarking Suite
                </div>
                <div
                  style={{
                    fontSize: 40,
                    color: "#6b7280"
                  }}
                >
                  Resumability & Concurrency Scaling
                </div>
              </div>
            );
          })()}
        </AbsoluteFill>
      </Sequence>

      {/* Resumability Metrics - Frames 60-180 */}
      <Sequence from={60} durationInFrames={120}>
        <AbsoluteFill
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: 50
          }}
        >
          <div
            style={{
              fontSize: 48,
              fontWeight: "bold",
              color: "#059669",
              marginBottom: 40,
              textAlign: "center"
            }}
          >
            Resumability Benchmarks
          </div>

          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              justifyContent: "center",
              maxWidth: 1000
            }}
          >
            <MetricBox label="Resume Time" value="2.3s" color="#059669" delay={0} />
            <MetricBox label="State Size" value="1.2MB" color="#0891b2" delay={15} />
            <MetricBox label="Overhead" value="0.1%" color="#7c3aed" delay={30} />
          </div>

          <div style={{ marginTop: 40, width: "80%", maxWidth: 600 }}>
            <ProgressBar progress={100} color="#059669" label="Checkpoint Recovery" delay={0} />
            <ProgressBar progress={95} color="#0891b2" label="State Restoration" delay={20} />
            <ProgressBar progress={99} color="#7c3aed" label="Validation" delay={40} />
          </div>
        </AbsoluteFill>
      </Sequence>

      {/* Concurrency Scaling - Frames 180-300 */}
      <Sequence from={180} durationInFrames={120}>
        <AbsoluteFill
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: 50
          }}
        >
          <div
            style={{
              fontSize: 48,
              fontWeight: "bold",
              color: "#d97706",
              marginBottom: 40
            }}
          >
            Concurrency Scaling
          </div>

          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              justifyContent: "center",
              maxWidth: 1000
            }}
          >
            <MetricBox label="1 Thread" value="1.0x" color="#3b82f6" delay={0} />
            <MetricBox label="4 Threads" value="3.8x" color="#8b5cf6" delay={15} />
            <MetricBox label="8 Threads" value="7.2x" color="#ec4899" delay={30} />
            <MetricBox label="Efficiency" value="90%" color="#059669" delay={45} />
          </div>

          {/* Simple bar chart visualization */}
          <div
            style={{
              marginTop: 50,
              display: "flex",
              alignItems: "flex-end",
              gap: 30,
              height: 200
            }}
          >
            {(() => {
              const bars = [
                { height: 60, label: "1T", color: "#3b82f6" },
                { height: 120, label: "4T", color: "#8b5cf6" },
                { height: 180, label: "8T", color: "#ec4899" }
              ];

              return bars.map((bar, i) => {
                const barHeight = interpolate(
                  frame - 180,
                  [i * 10, i * 10 + 30],
                  [0, bar.height],
                  { extrapolateRight: "clamp" }
                );

                return (
                  <div
                    key={i}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center"
                    }}
                  >
                    <div
                      style={{
                        width: 80,
                        height: barHeight,
                        backgroundColor: bar.color,
                        borderRadius: 8,
                        transition: "height 0.3s"
                      }}
                    />
                    <div
                      style={{
                        marginTop: 10,
                        fontSize: 24,
                        fontWeight: "bold",
                        color: "#333"
                      }}
                    >
                      {bar.label}
                    </div>
                  </div>
                );
              });
            })()}
          </div>
        </AbsoluteFill>
      </Sequence>

      {/* Output Formats - Frames 300-400 */}
      <Sequence from={300} durationInFrames={100}>
        <AbsoluteFill
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center"
          }}
        >
          <div
            style={{
              fontSize: 48,
              fontWeight: "bold",
              color: "#7c3aed",
              marginBottom: 40
            }}
          >
            Paper-Ready Output Formats
          </div>

          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              justifyContent: "center",
              gap: 20
            }}
          >
            <FormatBadge name="JSON" color="#3b82f6" delay={0} />
            <FormatBadge name="Markdown" color="#059669" delay={15} />
            <FormatBadge name="CSV" color="#d97706" delay={30} />
          </div>

          {(() => {
            const codeOpacity = interpolate(frame, [330, 360], [0, 1]);

            return (
              <div
                style={{
                  opacity: codeOpacity,
                  marginTop: 40,
                  backgroundColor: "#1e293b",
                  padding: 30,
                  borderRadius: 10,
                  fontFamily: "monospace",
                  fontSize: 16,
                  color: "#e2e8f0",
                  maxWidth: 700,
                  textAlign: "left"
                }}
              >
                <pre>{`{
  "resumability": { "time": 2.3, "overhead": "0.1%" },
  "concurrency": { "throughput": 7.2, "efficiency": "90%" }
}`}</pre>
              </div>
            );
          })()}
        </AbsoluteFill>
      </Sequence>

      {/* Summary - Frames 400-500 */}
      <Sequence from={400} durationInFrames={100}>
        <AbsoluteFill
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: 50
          }}
        >
          <div
            style={{
              fontSize: 56,
              fontWeight: "bold",
              color: "#1e40af",
              marginBottom: 50,
              textAlign: "center"
            }}
          >
            Benchmarking Suite Features
          </div>

          {(() => {
            const features = [
              "✓ Multiple Output Formats",
              "✓ Resumability Measurements",
              "✓ Concurrency Scaling Analysis",
              "✓ Reproducible Benchmarks",
              "✓ Paper-Ready Metrics"
            ];

            return features.map((feature, i) => {
              const opacity = interpolate(
                frame,
                [400 + i * 10, 400 + i * 10 + 15],
                [0, 1],
                { extrapolateRight: "clamp" }
              );

              const xTranslation = interpolate(
                frame,
                [400 + i * 10, 400 + i * 10 + 15],
                [-50, 0],
                { extrapolateRight: "clamp" }
              );

              return (
                <div
                  key={i}
                  style={{
                    opacity,
                    transform: `translateX(${xTranslation}px)`,
                    fontSize: 32,
                    color: "#059669",
                    margin: 10,
                    fontWeight: "bold"
                  }}
                >
                  {feature}
                </div>
              );
            });
          })()}
        </AbsoluteFill>
      </Sequence>
    </AbsoluteFill>
  );
};
