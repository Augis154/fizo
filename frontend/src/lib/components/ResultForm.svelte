<script lang="ts">
  import { missingScorableFields, scoreResult, type RawMetrics, type TemplateConfig } from "shared";
  import { toast } from "svelte-sonner";

  import { api, unwrap } from "$lib/api";
  import ExerciseField from "$lib/components/ExerciseField.svelte";
  import Link from "$lib/components/Link.svelte";
  import ScoreBreakdown from "$lib/components/ScoreBreakdown.svelte";
  import { ROUTES } from "$lib/routes";
  import { Alert, AlertDescription, AlertTitle } from "$lib/components/ui/alert";
  import { Button } from "$lib/components/ui/button";
  import { Card, CardContent } from "$lib/components/ui/card";
  import { Separator } from "$lib/components/ui/separator";
  import type { SessionParticipant } from "$lib/session.svelte";

  type Props = {
    challengeId: string;
    config: TemplateConfig;
    participant: SessionParticipant;
    /** Called after a successful submit so the parent can reload the attempt history. */
    onsubmitted: () => void;
  };

  let { challengeId, config, participant, onsubmitted }: Props = $props();

  // The form is remounted when the route changes, so seeding from `config` once is deliberate.
  // svelte-ignore state_referenced_locally
  let metrics = $state<RawMetrics>(Object.fromEntries(config.exercises.map((e) => [e.key, null])));
  let submitting = $state(false);

  // The same shared scoring code the API uses, so this preview matches what gets stored.
  const breakdown = $derived(scoreResult(config, metrics, participant));
  const scoreByKey = $derived(new Map(breakdown.exercises.map((score) => [score.key, score])));

  const missing = $derived(missingScorableFields(config, participant));

  // Before anything is entered, a "Failed" verdict on an empty form is just noise.
  const started = $derived(Object.values(metrics).some((value) => value !== null));

  const incomplete = $derived(
    config.exercises.filter((exercise) => exercise.required && metrics[exercise.key] === null)
  );

  const submit = async (event: SubmitEvent) => {
    event.preventDefault();
    if (submitting) return;
    submitting = true;
    try {
      await unwrap(
        await api.challenges[":id"].results.$post({ param: { id: challengeId }, json: { rawMetrics: metrics } })
      );
      toast.success("Result saved");
      metrics = Object.fromEntries(config.exercises.map((e) => [e.key, null]));
      onsubmitted();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save this result");
    } finally {
      submitting = false;
    }
  };
</script>

<form class="space-y-6" onsubmit={submit}>
  {#if missing.length > 0}
    <Alert variant="destructive">
      <AlertTitle>Your {missing.join(" and ")} {missing.length > 1 ? "are" : "is"} missing</AlertTitle>
      <AlertDescription>
        This challenge scores against {missing.join(" and ")} bands, so it cannot award you any points
        until you <Link to={ROUTES.myResults} class="underline underline-offset-4">add your details</Link>.
      </AlertDescription>
    </Alert>
  {/if}

  <div class="space-y-3">
    {#each config.exercises as exercise (exercise.key)}
      {@const score = scoreByKey.get(exercise.key)}
      <ExerciseField
        {exercise}
        {participant}
        bind:value={metrics[exercise.key]}
        points={score?.points ?? 0}
        maxPoints={score?.maxPoints ?? null}
        passPoints={score?.passPoints ?? null}
      />
    {/each}
  </div>

  <!-- Pinned to the bottom so the running score and submit stay reachable on a phone. It has no
       header, and the "still needed" list is clamped, to keep it from eating the small screen. -->
  <Card class="bg-card/95 sticky bottom-4 shadow-lg backdrop-blur">
    <CardContent class="space-y-3 py-4">
      <ScoreBreakdown {breakdown} {config} compact showVerdict={started} />
      <Separator />
      <Button type="submit" size="lg" class="h-11 w-full" disabled={submitting || incomplete.length > 0}>
        {submitting ? "Saving…" : "Submit result"}
      </Button>
      {#if incomplete.length > 0}
        <p class="text-muted-foreground line-clamp-2 text-center text-xs">
          Still needed: {incomplete.map((exercise) => exercise.name).join(", ")}
        </p>
      {/if}
    </CardContent>
  </Card>
</form>
