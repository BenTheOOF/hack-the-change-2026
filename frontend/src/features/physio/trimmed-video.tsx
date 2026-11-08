"use client";

import { useEffect, useRef, type ComponentProps, type Ref } from "react";

// A video that plays only between start and end (seconds), looping back to start.
// The full file is stored; the trim decides what patients and therapists watch.
export function TrimmedVideo({
  start = 0,
  end,
  ref,
  ...props
}: ComponentProps<"video"> & {
  start?: number;
  end?: number | null;
  ref?: Ref<HTMLVideoElement>;
}) {
  const own = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    const video = own.current;
    if (!video) return;
    const toStart = () => {
      if (video.currentTime < start - 0.05 || (end && video.currentTime > end))
        video.currentTime = start;
    };
    const loop = () => {
      // Also catches the native loop restarting at 0 when end is the file's end.
      if ((end && video.currentTime >= end) || video.currentTime < start - 0.25) {
        video.currentTime = start;
        if (!video.paused || video.loop) void video.play().catch(() => {});
      }
    };
    video.addEventListener("loadedmetadata", toStart);
    video.addEventListener("play", toStart);
    video.addEventListener("timeupdate", loop);
    if (video.readyState >= 1) toStart();
    return () => {
      video.removeEventListener("loadedmetadata", toStart);
      video.removeEventListener("play", toStart);
      video.removeEventListener("timeupdate", loop);
    };
  }, [start, end]);
  return (
    <video
      {...props}
      ref={(node) => {
        own.current = node;
        if (typeof ref === "function") ref(node);
        else if (ref) ref.current = node;
      }}
    />
  );
}
