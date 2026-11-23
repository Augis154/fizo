import type { Exercise, ExerciseUnit } from "./template";

/** Formats seconds as `mm:ss`, or `h:mm:ss` once it passes an hour. */
export const formatTime = (totalSeconds: number) => {
  const seconds = Math.max(0, Math.round(totalSeconds));
  const pad = (n: number) => String(n).padStart(2, "0");

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours}:${pad(minutes)}:${pad(seconds % 60)}`;
  return `${minutes}:${pad(seconds % 60)}`;
};

export const splitTime = (totalSeconds: number) => ({
  minutes: Math.floor(Math.max(0, totalSeconds) / 60),
  seconds: Math.max(0, Math.round(totalSeconds)) % 60,
});

export const joinTime = (minutes: number | null, seconds: number | null) =>
  minutes === null && seconds === null ? null : (minutes ?? 0) * 60 + (seconds ?? 0);

const unitSuffix: Record<ExerciseUnit, string> = {
  reps: "reps",
  seconds: "s",
  kg: "kg",
  meters: "m",
};

/** Renders a measurement the way its exercise is configured to be read. */
export const formatMeasurement = (exercise: Pick<Exercise, "unit" | "input">, value: number | null) => {
  if (value === null) return "—";
  if (exercise.input === "time") return formatTime(value);
  return `${value} ${unitSuffix[exercise.unit]}`;
};
