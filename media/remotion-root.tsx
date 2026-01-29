import { Composition } from "remotion";
import { BenchmarkingSuiteComposition } from "./benchmarking-suite-composition";

export const RemotionRoot = () => {
  return (
    <>
      <Composition
        id="BenchmarkingSuite"
        component={BenchmarkingSuiteComposition}
        durationInFrames={500}
        fps={30}
        width={1920}
        height={1080}
      />
    </>
  );
};
