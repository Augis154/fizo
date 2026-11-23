<script lang="ts">
  import { api, unwrap } from "$lib/api";
  import Link from "$lib/components/Link.svelte";
  import { Alert, AlertDescription, AlertTitle } from "$lib/components/ui/alert";
  import { Badge } from "$lib/components/ui/badge";
  import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "$lib/components/ui/card";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import { buttonVariants } from "$lib/components/ui/button";
  import { ROUTES } from "$lib/routes";
  import { session } from "$lib/session.svelte";

  const participant = session.participant!;

  const data = $derived(
    (async () => {
      const [space, challenges] = await Promise.all([
        api.spaces[":id"].$get({ param: { id: participant.spaceId } }).then(unwrap),
        api.spaces[":id"].challenges.$get({ param: { id: participant.spaceId } }).then(unwrap),
      ]);
      return { space, challenges };
    })()
  );

  const formatDate = (value: string) => new Date(value).toLocaleDateString();

  /** `status` is organiser-set, so trust it but fall back to the dates when it is missing. */
  const groupOf = (challenge: { status: string; startDate: string; endDate: string }) => {
    if (challenge.status === "active" || challenge.status === "upcoming" || challenge.status === "finished") {
      return challenge.status;
    }
    const now = Date.now();
    if (new Date(challenge.startDate).getTime() > now) return "upcoming";
    if (new Date(challenge.endDate).getTime() < now) return "finished";
    return "active";
  };

  const GROUPS = [
    { key: "active", title: "Open now", description: "You can submit results for these." },
    { key: "upcoming", title: "Upcoming", description: "Not open for results yet." },
    { key: "finished", title: "Finished", description: "Closed, but the leaderboards remain." },
  ] as const;
</script>

{#await data}
  <Skeleton class="h-10 w-64" />
  <Skeleton class="h-40 w-full" />
{:then { space, challenges }}
  <div class="space-y-1">
    <h1 class="text-2xl font-semibold tracking-tight">{space.title}</h1>
    <p class="text-muted-foreground text-sm">
      Taking part as <span class="font-medium">{participant.name}</span>
      {#if participant.age === null || participant.gender === null}
        · <Link to={ROUTES.myResults} class="underline underline-offset-4">complete your details</Link>
      {/if}
    </p>
  </div>

  {#if challenges.length === 0}
    <Alert>
      <AlertTitle>No challenges yet</AlertTitle>
      <AlertDescription>The organiser has not added any challenges to this space.</AlertDescription>
    </Alert>
  {/if}

  {#each GROUPS as group (group.key)}
    {@const inGroup = challenges.filter((challenge) => groupOf(challenge) === group.key)}
    {#if inGroup.length > 0}
      <section class="space-y-3">
        <div>
          <h2 class="text-lg font-medium">{group.title}</h2>
          <p class="text-muted-foreground text-sm">{group.description}</p>
        </div>

        {#each inGroup as challenge (challenge.id)}
          <Card>
            <CardHeader>
              <CardTitle class="flex flex-wrap items-center gap-2">
                {challenge.title}
                {#if group.key !== "active"}
                  <Badge variant="secondary">{group.title}</Badge>
                {/if}
              </CardTitle>
              <CardDescription>
                {formatDate(challenge.startDate)} – {formatDate(challenge.endDate)}
              </CardDescription>
            </CardHeader>

            <CardContent class="flex flex-wrap gap-2">
              {#if group.key === "active"}
                <Link to={ROUTES.challenge} params={{ id: challenge.id }} class={buttonVariants()}>Enter result</Link>
              {:else if group.key === "finished"}
                <Link to={ROUTES.challenge} params={{ id: challenge.id }} class={buttonVariants({ variant: "outline" })}>
                  View my results
                </Link>
              {/if}
              {#if group.key !== "upcoming"}
                <Link to={ROUTES.leaderboard} params={{ id: challenge.id }} class={buttonVariants({ variant: "ghost" })}>
                  Leaderboard
                </Link>
              {/if}
            </CardContent>
          </Card>
        {/each}
      </section>
    {/if}
  {/each}
{:catch error}
  <Alert variant="destructive">
    <AlertTitle>Could not load this space</AlertTitle>
    <AlertDescription>{error.message}</AlertDescription>
  </Alert>
{/await}
