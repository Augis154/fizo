<script lang="ts">
  import { formatMeasurement, formatTime, parseTemplateConfig, rankByScore } from "shared";

  import { api, unwrap } from "$lib/api";
  import { Alert, AlertDescription, AlertTitle } from "$lib/components/ui/alert";
  import { Badge } from "$lib/components/ui/badge";
  import { Card, CardDescription, CardHeader, CardTitle } from "$lib/components/ui/card";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
  } from "$lib/components/ui/table";
  import Link from "$lib/components/Link.svelte";
  import { buttonVariants } from "$lib/components/ui/button";
  import { ROUTES } from "$lib/routes";
  import { session } from "$lib/session.svelte";

  let { id }: { id: string } = $props();

  const participant = session.participant!;

  /** `null` sorts by rank; otherwise an exercise key or `"name"`. */
  let sortKey = $state<string | null>(null);
  let ascending = $state(false);

  const data = $derived(
    (async () => {
      const [challenge, template, results] = await Promise.all([
        api.challenges[":id"].$get({ param: { id } }).then(unwrap),
        api.challenges[":id"].template.$get({ param: { id } }).then(unwrap),
        api.challenges[":id"].results.$get({ param: { id } }).then(unwrap),
      ]);

      const config = parseTemplateConfig(template.config);
      const lowerIsBetter = config.aggregate.kind === "rawTimeSum";

      // Under rawTimeSum a total of 0 means nothing was performed, so it must rank last rather than
      // beating every real time.
      const rankValue = (entry: (typeof results)[number]) => {
        const total = Number(entry.totalScore);
        return lowerIsBetter && total <= 0 ? Number.POSITIVE_INFINITY : total;
      };

      // A participant may submit several attempts; the leaderboard shows each one's best.
      const best = new Map<string, (typeof results)[number]>();
      for (const result of results) {
        const incumbent = best.get(result.participantId);
        const better =
          !incumbent ||
          (lowerIsBetter
            ? rankValue(result) < rankValue(incumbent)
            : Number(result.totalScore) > Number(incumbent.totalScore));
        if (better) best.set(result.participantId, result);
      }

      const ranked = rankByScore([...best.values()], rankValue, lowerIsBetter);

      return { challenge, template, config, lowerIsBetter, ranked };
    })()
  );

  /**
   * `preferAscending` says which direction shows the best entries first for that column — ascending
   * for names and for raw times, descending for points.
   */
  const toggleSort = (key: string | null, preferAscending: boolean) => {
    if (sortKey === key) {
      ascending = !ascending;
      return;
    }
    sortKey = key;
    ascending = preferAscending;
  };

  /** A scored exercise sorts on points (more is better); an unscored one on its raw measurement. */
  const bestFirstAscending = (exercise: { scoring: { kind: string }; higherIsBetter: boolean }) =>
    exercise.scoring.kind === "none" && !exercise.higherIsBetter;

  const sortIndicator = (key: string | null) => (sortKey === key ? (ascending ? " ▲" : " ▼") : "");
</script>

{#await data}
  <Skeleton class="h-10 w-64" />
  <Skeleton class="h-64 w-full" />
{:then { challenge, template, config, lowerIsBetter, ranked }}
  {@const rows = (() => {
    if (sortKey === null) return ranked;
    if (sortKey === "name") {
      const byName = [...ranked].sort((a, b) => a.participantName.localeCompare(b.participantName));
      return ascending ? byName : byName.reverse();
    }
    const valueOf = (entry: (typeof ranked)[number]) => {
      const score = entry.scores.exercises.find((e) => e.key === sortKey);
      // Points where the exercise is scored, the measurement itself where it is not.
      return score ? (score.maxPoints === null ? (score.value ?? 0) : score.points) : 0;
    };
    const sorted = [...ranked].sort((a, b) => valueOf(a) - valueOf(b));
    return ascending ? sorted : sorted.reverse();
  })()}
  {@const myRank = ranked.findIndex((entry) => entry.participantId === participant.id)}

  <div class="space-y-1">
    <h1 class="text-2xl font-semibold tracking-tight">{challenge.title}</h1>
    <p class="text-muted-foreground text-sm">Leaderboard · {template.title}</p>
  </div>

  <div class="flex flex-wrap gap-2">
    <Link to={ROUTES.challenge} params={{ id }} class={buttonVariants({ variant: "outline" })}>Enter result</Link>
    <Link to={ROUTES.space} class={buttonVariants({ variant: "ghost" })}>All challenges</Link>
  </div>

  {#if myRank >= 0}
    <Card>
      <CardHeader>
        <CardTitle class="text-base">Your position</CardTitle>
        <CardDescription>
          {myRank + 1} of {ranked.length} ·
          {lowerIsBetter
            ? formatTime(Number(ranked[myRank].totalScore))
            : `${Number(ranked[myRank].totalScore)} points`}
        </CardDescription>
      </CardHeader>
    </Card>
  {/if}

  {#if ranked.length === 0}
    <Alert>
      <AlertTitle>No results yet</AlertTitle>
      <AlertDescription>Be the first to submit a result for this challenge.</AlertDescription>
    </Alert>
  {:else}
    <Card class="py-0">
      <div class="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead class="w-10">#</TableHead>
            <TableHead class="bg-card sticky left-0">
              <button type="button" class="font-medium" onclick={() => toggleSort("name", true)}>
                Participant{sortIndicator("name")}
              </button>
            </TableHead>
            {#each config.exercises as exercise (exercise.key)}
              <!-- Exercise names may wrap so the table fits without scrolling under the pinned total. -->
              <TableHead class="hidden text-right whitespace-normal sm:table-cell">
                <button type="button" class="font-medium" onclick={() => toggleSort(exercise.key, bestFirstAscending(exercise))}>
                  {exercise.name}{sortIndicator(exercise.key)}
                </button>
              </TableHead>
            {/each}
            <TableHead class="bg-card sticky right-0 border-l text-right">
              <button type="button" class="font-medium" onclick={() => toggleSort(null, lowerIsBetter)}>
                {lowerIsBetter ? "Time" : "Total"}{sortIndicator(null)}
              </button>
            </TableHead>
          </TableRow>
        </TableHeader>

        <TableBody>
          {#each rows as entry (entry.id)}
            {@const rank = ranked.indexOf(entry) + 1}
            <TableRow class={entry.participantId === participant.id ? "bg-muted/50" : undefined}>
              <TableCell class="text-muted-foreground tabular-nums">{rank}</TableCell>
              <TableCell class="bg-card sticky left-0 font-medium">
                {entry.participantName}
                {#if entry.participantId === participant.id}
                  <Badge variant="secondary">You</Badge>
                {/if}
              </TableCell>

              {#each config.exercises as exercise (exercise.key)}
                {@const score = entry.scores.exercises.find((e) => e.key === exercise.key)}
                <!-- The measurement may wrap under the points so the table fits. -->
                <TableCell class="hidden text-right tabular-nums whitespace-normal sm:table-cell">
                  {#if !score}
                    —
                  {:else if score.maxPoints === null}
                    {formatMeasurement(exercise, score.value)}
                  {:else}
                    {score.points}
                    <span class="text-muted-foreground text-xs">
                      ({formatMeasurement(exercise, score.value)})
                    </span>
                  {/if}
                </TableCell>
              {/each}

              <TableCell class="bg-card sticky right-0 border-l text-right font-semibold tabular-nums">
                {lowerIsBetter ? formatTime(Number(entry.totalScore)) : Number(entry.totalScore)}
                {#if entry.scores.passed === false}
                  <Badge variant="destructive">Failed</Badge>
                {/if}
              </TableCell>
            </TableRow>
          {/each}
        </TableBody>
      </Table>
      </div>
    </Card>

    <p class="text-muted-foreground text-xs">
      Showing each participant's best attempt. Click a column heading to sort.
      <span class="sm:hidden">Open a challenge to see the per-exercise breakdown.</span>
    </p>
  {/if}
{:catch error}
  <Alert variant="destructive">
    <AlertTitle>Could not load the leaderboard</AlertTitle>
    <AlertDescription>{error.message}</AlertDescription>
  </Alert>
{/await}
