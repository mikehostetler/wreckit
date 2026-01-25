import { Composition } from "remotion";
import { WreckitExampleComposition } from "./remotion-composition";

export const RemotionRoot = () => {
  return (
    <>
      <Composition
        id="WreckitExample"
        component={WreckitExampleComposition}
        durationInFrames={120}
        fps={30}
        width={1920}
        height={1080}
      />
    </>
  );
};
