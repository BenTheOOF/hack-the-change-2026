"use client";

import { useState } from "react";
import { Icon } from "@/features/ui/icons";
import { EXERCISES } from "./engine";
import type { CustomExercise } from "./movement";
import { TrimmedVideo } from "./trimmed-video";
import type { Prescription } from "./types";

export function MovementIllustration({
  exercise,
}: {
  exercise: Prescription["exercise"];
}) {
  return (
    <svg
      viewBox="0 0 240 200"
      aria-label={exercise === "custom" ? "Therapist exercise" : EXERCISES[exercise].name}
      role="img"
    >
      <ellipse
        cx="123"
        cy="176"
        rx="75"
        ry="9"
        fill="currentColor"
        opacity=".08"
      />
      <path
        d="M42 166h154"
        stroke="currentColor"
        opacity=".15"
        strokeDasharray="3 5"
      />
      <circle
        cx={exercise === "squat" ? 137 : 120}
        cy={exercise === "squat" ? 50 : 38}
        r="13"
        fill="#f0ae8c"
      />
      {exercise === "custom" ? (
        <>
          <path
            d="M120 61v58m0 0-18 45m18-45 18 45"
            fill="none"
            stroke="#4d6258"
            strokeWidth="17"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M113 72 92 98l14 22m21-48 21 26-14 22"
            fill="none"
            stroke="#f0ae8c"
            strokeWidth="10"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M78 110q-10-22 6-40m78 40q10-22-6-40"
            stroke="#b97a5a"
            strokeWidth="2"
            fill="none"
            strokeDasharray="4 4"
          />
          <path
            d="M89 168h19m24 0h19"
            stroke="#293d36"
            strokeWidth="8"
            strokeLinecap="round"
          />
        </>
      ) : exercise === "squat" ? (
        <>
          {/* Side view, facing right: hips back, chest up, knee over the toes. */}
          <path
            d="M125 70 103 112l45 9-17 41"
            fill="none"
            stroke="#426255"
            strokeWidth="19"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M123 79l33 13 28-3"
            fill="none"
            stroke="#f0ae8c"
            strokeWidth="10"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M122 168h29"
            stroke="#293d36"
            strokeWidth="8"
            strokeLinecap="round"
          />
        </>
      ) : (
        <>
          <path
            d="M120 61v58m0 0-22 45m22-45 22 45"
            fill="none"
            stroke="#4d6258"
            strokeWidth="17"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M113 70 76 65 48 60m79 10 37-5 28-5"
            fill="none"
            stroke="#f0ae8c"
            strokeWidth="10"
            strokeLinecap="round"
          />
          <path
            d="M87 168h19m27 0h20"
            stroke="#293d36"
            strokeWidth="8"
            strokeLinecap="round"
          />
          <path
            d="M50 90q-6-14 0-28m140 28q6-14 0-28"
            stroke="#b97a5a"
            strokeWidth="2"
            fill="none"
            strokeDasharray="4 4"
          />
        </>
      )}
      <circle cx="191" cy="35" r="20" fill="#fff" opacity=".55" />
      <path
        d="m183 35 6 6 10-12"
        fill="none"
        stroke="#52735f"
        strokeWidth="2"
      />
    </svg>
  );
}
export function DemoVideo({
  url,
  custom,
  onOpen,
  name,
}: {
  url?: string;
  custom?: CustomExercise;
  onOpen: () => Promise<void>;
  name: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="demo-video-inline">
      <button
        type="button"
        className="text-button"
        aria-expanded={open}
        onClick={() => {
          setOpen(!open);
          if (!open) void onOpen();
        }}
      >
        {open ? (
          "Hide demo video"
        ) : (
          <>
            <Icon name="play" size={16} /> Watch your therapist&apos;s demo
          </>
        )}
      </button>
      {open &&
        (url ? (
          <TrimmedVideo
            src={url}
            start={(custom?.demo_start_ms ?? 0) / 1000}
            end={custom?.demo_end_ms ? custom.demo_end_ms / 1000 : null}
            controls
            muted
            loop
            playsInline
            aria-label={"Demo of " + name}
          />
        ) : (
          <p className="muted">Loading the demo video…</p>
        ))}
    </div>
  );
}
