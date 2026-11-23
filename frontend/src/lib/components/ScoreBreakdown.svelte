<script lang="ts">
  import { formatMeasurement, formatTime, type ScoreBreakdown, type TemplateConfig } from "shared";

  import { Badge } from "$lib/components/ui/badge";
  import { Separator } from "$lib/components/ui/separator";

  type Props = {
    breakdown: ScoreBreakdown;
    config: TemplateConfig;
    /** Hides the per-exercise rows, leaving just the total. */
    compact?: boolean;
    /** Set false to hide the pass/fail verdict, e.g. on a form nothing has been entered into yet. */
    showVerdict?: boolean;
  };

  let { breakdown, config, compact = false, showVerdict = true }: Props = $props();

  const inputByKey = $derived(new Map(config.exercises.map((e) => [e.key, e])));

  /** A raw-time total is a duration; a points total is a number out of `maxTotal`. */
  const formatTotal = (value: number) => (breakdown.lowerIsBetter ? formatTime(value) : String(value));
</script>

<div class="space-y-3">
  {#if !compact}
    {#each breakdown.exercises as score (score.key)}
      {@const exercise = inputByKey.get(score.key)}
      <div class="flex items-center justify-between gap-3 text-sm">
        <span class="min-w-0 flex-1 truncate">{score.name}</span>
        <span class="tabular-nums">
          {exercise ? formatMeasurement(exercise, score.value) : (score.value ?? "—")}
        </span>
        {#if score.maxPoints !== null}
          <Badge
            class="w-20 justify-center"
            variant={score.passed === null ? "secondary" : score.passed ? "default" : "destructive"}
          >
            {score.points} pts
          </Badge>
        {/if}
      </div>
    {/each}

    <Separator />
  {/if}

  <div class="flex items-center justify-between gap-3">
    <span class="font-medium">
      {breakdown.lowerIsBetter ? "Total time" : "Total score"}
    </span>
    <span class="flex items-center gap-2">
      <span class="text-lg font-semibold tabular-nums">
        {formatTotal(breakdown.total)}{#if breakdown.maxTotal !== null}<span class="text-muted-foreground text-sm">
            &nbsp;/ {breakdown.maxTotal}
          </span>{/if}
      </span>
      {#if breakdown.passed !== null && showVerdict}
        <Badge variant={breakdown.passed ? "default" : "destructive"}>
          {breakdown.passed ? "Passed" : "Failed"}
        </Badge>
      {/if}
    </span>
  </div>

  {#if breakdown.passed === false && showVerdict}
    <!-- A template can require a per-exercise mark, an overall mark, or both; say which is short. -->
    {@const failing = breakdown.exercises.filter((score) => score.passed === false)}
    {@const totalShort =
      breakdown.passTotal !== null &&
      (breakdown.lowerIsBetter ? breakdown.total <= 0 || breakdown.total > breakdown.passTotal : breakdown.total < breakdown.passTotal)}
    <p class="text-muted-foreground line-clamp-2 text-xs">
      {#if failing.length > 0}
        Below the pass mark in {failing.map((score) => score.name).join(", ")}.
      {/if}
      {#if totalShort && breakdown.passTotal !== null}
        {breakdown.lowerIsBetter
          ? `Finish within ${formatTime(breakdown.passTotal)} to pass.`
          : `${breakdown.passTotal} points needed in total.`}
      {/if}
    </p>
  {/if}
</div>
