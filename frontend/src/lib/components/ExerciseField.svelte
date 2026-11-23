<script lang="ts">
  import { exerciseTargets, formatMeasurement, joinTime, type Exercise, type Scorable } from "shared";

  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import { Badge } from "$lib/components/ui/badge";
  import { Card, CardContent } from "$lib/components/ui/card";

  type Props = {
    exercise: Exercise;
    participant: Scorable;
    /** Seconds for a `time` input, otherwise the raw measurement. `null` means not performed. */
    value: number | null;
    /** Points this value currently scores, computed by the parent from the shared scoring code. */
    points: number;
    maxPoints: number | null;
    passPoints: number | null;
  };

  let { exercise, participant, value = $bindable(), points, maxPoints, passPoints }: Props = $props();

  // A time exercise is stored as seconds but entered as minutes + seconds, like FIZO202's run field.
  let minutes = $state<number | null>(null);
  let seconds = $state<number | null>(null);

  const onTimeInput = () => {
    value = joinTime(minutes, seconds);
  };

  const targets = $derived(exerciseTargets(exercise, participant));
  const passTarget = $derived(passPoints === null ? null : targets.find((t) => t.points === passPoints));
  const bestTarget = $derived(targets.length > 0 ? targets[targets.length - 1] : null);

  const reached = $derived(passPoints !== null && points >= passPoints);
  const unitHint = $derived(
    exercise.input === "time"
      ? "minutes and seconds"
      : exercise.unit === "reps"
        ? "repetitions"
        : exercise.unit === "kg"
          ? "kilograms"
          : "metres"
  );
</script>

<Card size="sm">
    <CardContent class="space-y-3">
    <div class="flex flex-wrap items-start justify-between gap-2">
      <div>
        <Label for="exercise-{exercise.key}" class="text-base">
          {exercise.name}
          {#if !exercise.required}
            <span class="text-muted-foreground text-xs font-normal">(optional)</span>
          {/if}
        </Label>
        <p class="text-muted-foreground mt-0.5 text-xs">
          {unitHint} · {exercise.higherIsBetter ? "higher is better" : "lower is better"}
        </p>
      </div>

      {#if maxPoints !== null}
        <Badge variant={passPoints === null ? "secondary" : reached ? "default" : "destructive"}>
          {points} / {maxPoints} pts
        </Badge>
      {/if}
    </div>

    {#if exercise.input === "time"}
      <div class="flex items-end gap-2">
        <div class="flex-1 space-y-1">
          <Label for="exercise-{exercise.key}" class="text-muted-foreground text-xs">Minutes</Label>
          <Input
            id="exercise-{exercise.key}"
            type="number"
            min="0"
            inputmode="numeric"
            placeholder="0"
            class="h-11 text-base"
            bind:value={minutes}
            oninput={onTimeInput}
            required={exercise.required}
          />
        </div>
        <span class="pb-2 text-lg leading-none">:</span>
        <div class="flex-1 space-y-1">
          <Label for="exercise-{exercise.key}-seconds" class="text-muted-foreground text-xs">Seconds</Label>
          <Input
            id="exercise-{exercise.key}-seconds"
            type="number"
            min="0"
            max="59"
            inputmode="numeric"
            placeholder="00"
            class="h-11 text-base"
            bind:value={seconds}
            oninput={onTimeInput}
          />
        </div>
      </div>
    {:else}
      <Input
        id="exercise-{exercise.key}"
        type="number"
        min="0"
        inputmode="numeric"
        placeholder="0"
        class="h-11 text-base"
        bind:value
        required={exercise.required}
      />
    {/if}

    {#if passTarget || bestTarget}
      <p class="text-muted-foreground text-xs">
        {#if passTarget}
          <span class="font-medium">{passTarget.points} pts:</span>
          {formatMeasurement(exercise, passTarget.value)}
        {/if}
        {#if passTarget && bestTarget && bestTarget.points !== passTarget.points}
          <span class="mx-1">·</span>
        {/if}
        {#if bestTarget && bestTarget.points !== passTarget?.points}
          <span class="font-medium">{bestTarget.points} pts:</span>
          {formatMeasurement(exercise, bestTarget.value)}
        {/if}
      </p>
    {/if}
  </CardContent>
</Card>
