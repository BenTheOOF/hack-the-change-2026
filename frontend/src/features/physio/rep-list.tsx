"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/features/ui/icons";
import type { PoseFrame } from "./engine";
import { exerciseInfo, type CustomExercise } from "./movement";
import { PoseReplay } from "./pose-replay";
import type { Rep } from "./types";

export type Replay = { frames: PoseFrame[]; url?: string; revoke?: boolean };
export type ReplaySource = Pick<Rep, "id"> &
  Partial<Pick<Rep, "frames" | "local_clip_url" | "clip_path">>;

// The reviewed rep, shown under the therapist's comment. Loads once when the card appears.
export function RepClip({ load }: { load: () => Promise<Replay> }) {
  const loader = useRef(load);
  const [replay, setReplay] = useState<Replay | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    let loaded: Replay | undefined;
    loader.current().then(
      (result) => {
        loaded = result;
        if (live) setReplay(result);
        else if (result.revoke && result.url) URL.revokeObjectURL(result.url);
      },
      () => live && setFailed(true),
    );
    return () => {
      live = false;
      if (loaded?.revoke && loaded.url) URL.revokeObjectURL(loaded.url);
    };
  }, []);
  return (
    <div className="feedback-clip">
      <span className="feedback-clip-label">
        The rep your therapist reviewed
      </span>
      {failed ? (
        <p className="muted">
          The recording of this rep is no longer available.
        </p>
      ) : !replay ? (
        <p className="muted">Loading your rep…</p>
      ) : (
        <PoseReplay frames={replay.frames} videoUrl={replay.url} />
      )}
    </div>
  );
}
export function RepList({
  reps,
  customs,
  loadReplay,
  videoIds,
}: {
  reps: Rep[];
  customs: CustomExercise[];
  loadReplay: (rep: Rep) => Promise<Replay>;
  videoIds: Set<string>;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [replay, setReplay] = useState<Replay | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(
    () => () => {
      if (replay?.revoke && replay.url) URL.revokeObjectURL(replay.url);
    },
    [replay],
  );
  async function toggle(rep: Rep) {
    setReplay(null);
    setFailed(false);
    if (open === rep.id) {
      setOpen(null);
      return;
    }
    setOpen(rep.id);
    setLoading(true);
    try {
      setReplay(await loadReplay(rep));
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }
  return (
    <div className="rep-list">
      {reps.map((rep) => (
        <div className="rep-item" key={rep.id}>
          <div className="rep-row">
            <span className="exercise-symbol">
              <Icon name={rep.exercise === "squat" ? "down" : "up"} />
            </span>
            <div>
              <strong>{exerciseInfo(rep, customs).name}</strong>
              <small>
                {rep.exercise_day} · {Math.round(rep.confidence * 100)}%
                confidence
              </small>
              <p>{rep.feedback}</p>
            </div>
            <span className={"badge " + rep.label}>
              {rep.label === "correct"
                ? "Accepted"
                : rep.label === "incorrect"
                  ? "Adjustment"
                  : "Pending review"}
            </span>
            <button
              type="button"
              className="secondary watch-button"
              aria-expanded={open === rep.id}
              onClick={() => void toggle(rep)}
            >
              {open === rep.id ? (
                "Close"
              ) : (
                <>
                  <Icon name="play" size={16} />
                  {videoIds.has(rep.id) ? "Watch video" : "Pose replay"}
                </>
              )}
            </button>
          </div>
          {open === rep.id && (
            <div className="history-replay">
              {loading ? (
                <p className="muted">Loading replay…</p>
              ) : failed || !replay ? (
                <p className="muted">This replay could not be loaded.</p>
              ) : (
                <PoseReplay frames={replay.frames} videoUrl={replay.url} />
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
