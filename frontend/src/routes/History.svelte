<script lang="ts">
  import { ParticipantGender, formatTime, parseTemplateConfig, type TemplateConfig } from "shared";
  import { toast } from "svelte-sonner";

  import { api, unwrap } from "$lib/api";
  import ScoreBreakdown from "$lib/components/ScoreBreakdown.svelte";
  import { Alert, AlertDescription, AlertTitle } from "$lib/components/ui/alert";
  import { Badge } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";
  import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "$lib/components/ui/card";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import Link from "$lib/components/Link.svelte";
  import { buttonVariants } from "$lib/components/ui/button";
  import { ROUTES } from "$lib/routes";
  import { session } from "$lib/session.svelte";

  const stored = session.participant!;

  let name = $state(stored.name);
  let age = $state<number | null>(stored.age);
  let gender = $state<ParticipantGender | null>(stored.gender);
  let saving = $state(false);

  let reloadToken = $state(0);

  const data = $derived.by(() => {
    reloadToken;
    return (async () => {
      const [challenges, results] = await Promise.all([
        api.spaces[":id"].challenges.$get({ param: { id: stored.spaceId } }).then(unwrap),
        api.participants.me.results.$get().then(unwrap),
      ]);

      const challengeById = new Map(challenges.map((challenge) => [challenge.id, challenge]));

      // One template fetch per distinct template, not per challenge, so measurements can be
      // formatted with their units.
      const firstChallengeOfTemplate = new Map<string, string>();
      for (const challenge of challenges) {
        if (!firstChallengeOfTemplate.has(challenge.templateId)) {
          firstChallengeOfTemplate.set(challenge.templateId, challenge.id);
        }
      }

      const configs = new Map<string, TemplateConfig>(
        await Promise.all(
          [...firstChallengeOfTemplate].map(async ([templateId, challengeId]) => {
            const template = await api.challenges[":id"].template.$get({ param: { id: challengeId } }).then(unwrap);
            return [templateId, parseTemplateConfig(template.config)] as const;
          })
        )
      );

      // Group a participant's attempts under the challenge they belong to, oldest first inside each
      // group so progress reads forwards.
      const groups = [...challengeById.values()]
        .map((challenge) => ({
          challenge,
          config: configs.get(challenge.templateId),
          attempts: results
            .filter((result) => result.challengeId === challenge.id)
            .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
        }))
        .filter((group) => group.attempts.length > 0 && group.config)
        .sort(
          (a, b) =>
            new Date(b.attempts[b.attempts.length - 1].createdAt).getTime() -
            new Date(a.attempts[a.attempts.length - 1].createdAt).getTime()
        );

      return { groups, totalResults: results.length };
    })();
  });

  const save = async (event: SubmitEvent) => {
    event.preventDefault();
    if (saving) return;
    saving = true;
    try {
      const updated = await unwrap(
        await api.participants.me.$patch({ json: { name: name.trim(), age, gender } })
      );
      session.set({
        ...session.current!,
        participant: {
          id: updated.id,
          spaceId: updated.spaceId,
          name: updated.name,
          age: updated.age,
          gender: updated.gender,
        },
      });
      toast.success("Details saved");
      // Scores already stored keep their snapshot; only new results use the updated details.
      reloadToken += 1;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save your details");
    } finally {
      saving = false;
    }
  };

  const changed = $derived(name.trim() !== stored.name || age !== stored.age || gender !== stored.gender);
</script>

<div class="space-y-1">
  <h1 class="text-2xl font-semibold tracking-tight">My results</h1>
  <p class="text-muted-foreground text-sm">Your details and every result you have submitted in this space.</p>
</div>

<Card>
  <CardHeader>
    <CardTitle class="text-base">Your details</CardTitle>
    <CardDescription>
      Age and gender decide which scoring band applies to you. Changing them affects future results
      only — results already submitted keep the score they were given.
    </CardDescription>
  </CardHeader>

  <CardContent>
    <form class="space-y-4" onsubmit={save}>
      <div class="grid gap-4 sm:grid-cols-3">
        <div class="space-y-1.5">
          <Label for="me-name">Name</Label>
          <Input id="me-name" class="h-11 text-base" bind:value={name} required maxlength={255} />
        </div>
        <div class="space-y-1.5">
          <Label for="me-age">Age</Label>
          <Input id="me-age" type="number" min="1" max="120" inputmode="numeric" class="h-11 text-base" bind:value={age} />
        </div>
        <div class="space-y-1.5">
          <Label>Gender</Label>
          <div class="flex gap-2">
            {#each [ParticipantGender.Male, ParticipantGender.Female] as option (option)}
              <Button
                type="button"
                class="h-11 flex-1 capitalize"
                variant={gender === option ? "default" : "outline"}
                onclick={() => (gender = gender === option ? null : option)}
              >
                {option}
              </Button>
            {/each}
          </div>
        </div>
      </div>

      <Button type="submit" size="lg" class="h-11 w-full sm:w-auto" disabled={saving || !changed || name.trim() === ""}>
        {saving ? "Saving…" : "Save details"}
      </Button>
    </form>
  </CardContent>
</Card>

{#await data}
  <Skeleton class="h-64 w-full" />
{:then { groups, totalResults }}
  {#if totalResults === 0}
    <Alert>
      <AlertTitle>Nothing submitted yet</AlertTitle>
      <AlertDescription>
        Pick an open challenge to record your first result.
        <Link to={ROUTES.space} class={buttonVariants({ variant: "link", class: "h-auto p-0" })}>Browse challenges</Link>
      </AlertDescription>
    </Alert>
  {/if}

  {#each groups as group (group.challenge.id)}
    {@const latest = group.attempts[group.attempts.length - 1]}
    {@const first = group.attempts[0]}
    {@const delta = group.attempts.length > 1 ? latest.scores.total - first.scores.total : null}
    <section class="space-y-3">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <h2 class="text-lg font-medium">{group.challenge.title}</h2>
        <div class="flex items-center gap-2">
          {#if delta !== null && delta !== 0}
            {@const improved = latest.scores.lowerIsBetter ? delta < 0 : delta > 0}
            <Badge variant={improved ? "default" : "destructive"}>
              {improved ? "↑" : "↓"}
              {latest.scores.lowerIsBetter ? formatTime(Math.abs(delta)) : Math.abs(delta)} since your first
            </Badge>
          {/if}
          <Link
            to={ROUTES.leaderboard}
            params={{ id: group.challenge.id }}
            class={buttonVariants({ variant: "ghost", size: "sm" })}
          >
            Leaderboard
          </Link>
        </div>
      </div>

      {#each [...group.attempts].reverse() as attempt (attempt.id)}
        <Card>
          <CardHeader>
            <CardTitle class="text-base">{new Date(attempt.createdAt).toLocaleString()}</CardTitle>
          </CardHeader>
          <CardContent>
            <ScoreBreakdown breakdown={attempt.scores} config={group.config!} />
          </CardContent>
        </Card>
      {/each}
    </section>
  {/each}
{:catch error}
  <Alert variant="destructive">
    <AlertTitle>Could not load your results</AlertTitle>
    <AlertDescription>{error.message}</AlertDescription>
  </Alert>
{/await}
