import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";

export type VideoProps = {
  topic: string;
  style?: string | null;
  voice?: string | null;
  length?: string | null;
  resolution?: string | null;
  language?: string | null;
  tone?: string | null;
  music?: string | null;
};

export const Video: React.FC<VideoProps> = (props) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const opacity = interpolate(frame, [0, fps * 0.8], [0, 1], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: "white",
        fontFamily: "system-ui, Arial",
        padding: 80,
        justifyContent: "center",
      }}
    >
      <div style={{ opacity }}>
        <div style={{ fontSize: 56, fontWeight: 800, lineHeight: 1.1 }}>
          {props.topic || "Untitled Project"}
        </div>

        <div style={{ marginTop: 24, fontSize: 22, color: "#333" }}>
          <div>Style: {props.style ?? "-"}</div>
          <div>Voice: {props.voice ?? "-"}</div>
          <div>Length: {props.length ?? "-"}</div>
          <div>Resolution: {props.resolution ?? "-"}</div>
          <div>Language: {props.language ?? "-"}</div>
          <div>Tone: {props.tone ?? "-"}</div>
          <div>Music: {props.music ?? "-"}</div>
        </div>

        <div style={{ marginTop: 36, fontSize: 18, color: "#666" }}>
          Rendered locally with Remotion ✅
        </div>
      </div>
    </AbsoluteFill>
  );
};
