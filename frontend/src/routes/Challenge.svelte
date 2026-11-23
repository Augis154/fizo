<script lang="ts">
  import { formatTime, parseTemplateConfig } from "shared";

  import { api, unwrap } from "$lib/api";
  import ResultForm from "$lib/components/ResultForm.svelte";
  import ScoreBreakdown from "$lib/components/ScoreBreakdown.svelte";
  import { Alert, AlertDescription, AlertTitle } from "$lib/components/ui/alert";
  import { Badge } from "$lib/components/ui/badge";
  import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "$lib/components/ui/card";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import Link from "$lib/components/Link.svelte";
  import { buttonVariants } from "$lib/components/ui/button";
  import { ROUTES } from "$lib/routes";
  import { session } from "$lib/session.svelte";

  let { id }: { id: string } = $props();

  const participant = session.participant!;

  // Bumped after a submit to re-run the loader.
  let reloadToken = $state(0);

  const data = $derived.by(() => {
    reloadToken;
    return (async () => {
      const [challenge, template, results] = await Promise.all([
        api.challenges[":id"].$get({ param: { id } }).then(unwrap),
        api.challenges[":id"].template.$get({ param: { id } }).then(unwrap),
        api.participants.me.results.$get().then(unwrap),
      ]);

      return {
        challenge,
        template,
        config: parseTemplateConfig(template.config),
        attempts: results
          .filter((result) => result.challengeId === id)
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
      };
    })();
  });

  const open = (challenge: { status: string }) => challenge.status === "active";

  const formatDate = (value: string) => new Date(value).toLocaleString();
</script>

{#await data}
  <Skeleton class="h-10 w-64" />
  <Skeleton class="h-64 w-full" />
{:then { challenge, template, config, attempts }}
  <div class="space-y-1">
    <h1 class="text-2xl font-semibold tracking-tight">{challenge.title}</h1>
    <p class="text-muted-foreground text-sm">
      {template.title} · {new Date(challenge.startDate).toLocaleDateString()} – {new Date(
        challenge.endDate
      ).toLocaleDateString()}
    </p>
  </div>

  <div class="flex flex-wrap gap-2">
    <Link to={ROUTES.leaderboard} params={{ id }} class={buttonVariants({ variant: "outline" })}>Leaderboard</Link>
    <Link to={ROUTES.space} class={buttonVariants({ variant: "ghost" })}>All challenges</Link>
  </div>

  {#if open(challenge)}
    <ResultForm challengeId={id} {config} {participant} onsubmitted={() => (reloadToken += 1)} />
  {:else}
    <Alert>
      <AlertTitle>This challenge is {challenge.status}</AlertTitle>
      <AlertDescription>Results can only be submitted while a challenge is open.</AlertDescription>
    </Alert>
  {/if}

  <section class="space-y-3">
    <h2 class="text-lg font-medium">
      Your attempts
      {#if attempts.length > 0}
        <Badge variant="secondary">{attempts.length}</Badge>
      {/if}
    </h2>

    {#if attempts.length === 0}
      <p class="text-muted-foreground text-sm">
        Nothing submitted yet. You may submit as many attempts as you like.
      </p>
    {:else}
      {#each attempts as attempt, index (attempt.id)}
        {@const previous = attempts[index + 1]}
        {@const delta = previous ? attempt.scores.total - previous.scores.total : null}
        <Card>
          <CardHeader>
            <CardTitle class="flex flex-wrap items-center gap-2 text-base">
              {formatDate(attempt.createdAt)}
              {#if index === 0 && attempts.length > 1}
                <Badge variant="secondary">Latest</Badge>
              {/if}
            </CardTitle>
            {#if delta !== null && delta !== 0}
              <CardDescription>
                <!-- A raw-time total improves by going down, a points total by going up. -->
                {@const improved = attempt.scores.lowerIsBetter ? delta < 0 : delta > 0}
                {improved ? "Improved by" : "Down by"}
                {attempt.scores.lowerIsBetter ? formatTime(Math.abs(delta)) : Math.abs(delta)}
                compared with your previous attempt
              </CardDescription>
            {/if}
          </CardHeader>
          <CardContent>
            <!-- The stored snapshot, so this shows how it was scored at the time. -->
            <ScoreBreakdown breakdown={attempt.scores} {config} />
          </CardContent>
        </Card>
      {/each}
    {/if}
  </section>
{:catch error}
  <Alert variant="destructive">
    <AlertTitle>Could not load this challenge</AlertTitle>
    <AlertDescription>{error.message}</AlertDescription>
  </Alert>
{/await}
