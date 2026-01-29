import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";

export const WreckitExampleComposition = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  // Animate opacity from 0 to 1 over first 30 frames
  const opacity = interpolate(frame, [0, 30], [0, 1], {
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ backgroundColor: "white" }}>
      <div
        style={{
          opacity,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 80,
          fontWeight: "bold",
          color: "#333",
        }}
      >
        Wreckit Media Layer
      </div>
    </AbsoluteFill>
  );
};
