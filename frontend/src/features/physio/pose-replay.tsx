"use client";

import { useEffect, useRef, useState } from "react";
import { drawSkeleton, type PoseFrame } from "./engine";

export function PoseReplay({
  frames,
  videoUrl,
}: {
  frames: PoseFrame[];
  videoUrl?: string;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(true);
  const [skeleton, setSkeleton] = useState(true);
  useEffect(() => {
    const ctx = canvas.current?.getContext("2d");
    if (!skeleton || !frames.length || (!playing && !videoUrl)) {
      if (!skeleton) ctx?.clearRect(0, 0, 480, 360);
      return;
    }
    let animation = 0;
    const start = performance.now(),
      duration = frames.at(-1)!.t - frames[0].t + 500;
    const loop = () => {
      const elapsed =
        videoUrl && video.current
          ? video.current.currentTime * 1000 + frames[0].t
          : ((performance.now() - start) % duration) + frames[0].t;
      const frame = frames.find((f) => f.t >= elapsed) ?? frames.at(-1)!;
      if (ctx) drawSkeleton(ctx, frame.points, 480, 360);
      animation = requestAnimationFrame(loop);
    };
    loop();
    return () => cancelAnimationFrame(animation);
  }, [frames, playing, videoUrl, skeleton]);
  return (
    <div className="replay">
      <div className="pose-replay">
        {videoUrl && (
          <video
            ref={video}
            src={videoUrl}
            controls
            autoPlay
            loop
            muted
            playsInline
            aria-label="Recorded rep video"
          />
        )}
        <canvas
          ref={canvas}
          width={480}
          height={360}
          aria-label="Recorded pose skeleton"
        />
        <span className="camera-chip">
          {videoUrl ? "Video replay" : "Pose replay"}
        </span>
      </div>
      <div className="replay-controls">
        {videoUrl ? (
          <button
            type="button"
            className="text-button"
            onClick={() => setSkeleton(!skeleton)}
          >
            {skeleton ? "Hide" : "Show"} skeleton overlay
          </button>
        ) : (
          <>
            <button
              type="button"
              className="text-button"
              onClick={() => setPlaying(!playing)}
            >
              {playing ? "Pause" : "Play"} skeleton
            </button>
            <span className="muted">No video for this rep.</span>
          </>
        )}
      </div>
    </div>
  );
}
