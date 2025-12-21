import React from "react";
import { Composition } from "remotion";
import { Video, type VideoProps } from "./Video";

export const RemotionRoot: React.FC = () => {
  return (
    <Composition<VideoProps>
      id="Main"
      component={Video}
      durationInFrames={300} // 10s @ 30fps
      fps={30}
      width={1920}
      height={1080}
      defaultProps={{
        topic: "Demo render",
        style: "modern",
        voice: "AI Voice",
        length: "60 seconds",
        resolution: "1080p",
        language: "English",
        tone: "friendly",
        music: "ambient",
      }}
    />
  );
};
