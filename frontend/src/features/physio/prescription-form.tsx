"use client";

import { useState } from "react";
import { Icon } from "@/features/ui/icons";
import { localDay } from "./day";
import type { CustomExercise } from "./movement";
import type { Overview } from "./types";

export function PrescriptionForm({
  patients,
  customs,
  busy,
  onSubmit,
}: {
  patients: NonNullable<Overview["patients"]>;
  customs: CustomExercise[];
  busy: boolean;
  // Resolves to a follow-up sentence on success, or null when saving failed.
  onSubmit: (body: Record<string, unknown>) => Promise<string | null>;
}) {
  const [saved, setSaved] = useState("");
  return (
    <form
      className="prescription-form"
      onChange={() => setSaved("")}
      onSubmit={async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const d = new FormData(form);
        const choice = String(d.get("exercise"));
        const custom = choice.startsWith("custom:") ? choice.slice(7) : null;
        const select = form.elements.namedItem("exercise") as HTMLSelectElement;
        const patient = form.elements.namedItem("patient_id") as HTMLSelectElement;
        const exerciseName = select.selectedOptions[0]?.textContent ?? "The exercise";
        const patientName = patient.selectedOptions[0]?.textContent ?? "your patient";
        setSaved("");
        const next = await onSubmit({
          patient_id: d.get("patient_id"),
          exercise: custom ? "custom" : choice,
          custom_exercise_id: custom,
          daily_target: Number(d.get("daily_target")),
          starts_on: d.get("starts_on"),
          ends_on: d.get("ends_on"),
          instructions: d.get("instructions"),
          confidence_threshold: Number(d.get("confidence_threshold")),
        });
        if (next !== null)
          setSaved(
            `${exerciseName} prescribed to ${patientName}: ${d.get("daily_target")} reps a day, ${d.get("starts_on")} to ${d.get("ends_on")}. ${next}`,
          );
      }}
    >
      <label>
        Patient
        <select name="patient_id" required disabled={!patients.length}>
          {patients.map((p) => (
            <option value={p.patient_id} key={p.patient_id}>
              {p.care_profiles.display_name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Exercise
        <select name="exercise">
          <option value="squat">Bodyweight squat</option>
          <option value="shoulder_abduction">Shoulder abduction</option>
          {customs.length > 0 && (
            <optgroup label="Your exercises">
              {customs.map((c) => (
                <option value={"custom:" + c.id} key={c.id}>
                  {c.name}
                </option>
              ))}
            </optgroup>
          )}
        </select>
      </label>
      <label>
        Daily target
        <input
          name="daily_target"
          type="number"
          min={1}
          max={200}
          defaultValue={10}
          required
        />
      </label>
      <label>
        Start date
        <input
          name="starts_on"
          type="date"
          defaultValue={localDay()}
          required
        />
      </label>
      <label>
        End date
        <input name="ends_on" type="date" min={localDay()} required />
      </label>
      <label>
        Confidence threshold
        <input
          name="confidence_threshold"
          type="number"
          min={0.6}
          max={0.99}
          step={0.01}
          defaultValue={0.8}
          required
        />
      </label>
      <label className="full-width">
        Movement cue
        <input
          name="instructions"
          maxLength={2000}
          placeholder="Your prescribed range and setup cue"
        />
      </label>
      <div className="form-actions">
        <button className="primary" disabled={busy || !patients.length}>
          {busy ? "Saving…" : "Save prescription"}
        </button>
        {saved && (
          <p className="form-success" role="status">
            <Icon name="check" size={18} /> {saved}
          </p>
        )}
      </div>
    </form>
  );
}
