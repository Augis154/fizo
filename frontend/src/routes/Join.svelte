<script lang="ts">
  import { ParticipantGender } from "shared";
  import { toast } from "svelte-sonner";

  import { api, unwrap } from "$lib/api";
  import { Alert, AlertDescription, AlertTitle } from "$lib/components/ui/alert";
  import { Button } from "$lib/components/ui/button";
  import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "$lib/components/ui/card";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import { goto, ROUTES } from "$lib/routes";
  import { session } from "$lib/session.svelte";

  let { shortId }: { shortId: string } = $props();

  let name = $state("");
  let age = $state<number | null>(null);
  let gender = $state<ParticipantGender | null>(null);
  let submitting = $state(false);

  const space = $derived(
    (async () => unwrap(await api.spaces.join[":shortId"].$get({ param: { shortId } })))()
  );

  const join = async (event: SubmitEvent) => {
    event.preventDefault();
    if (submitting) return;
    submitting = true;
    try {
      const res = await unwrap(
        await api.spaces.join[":shortId"].$post({
          param: { shortId },
          json: { name: name.trim(), age: age ?? undefined, gender: gender ?? undefined },
        })
      );
      session.set({
        accessToken: res.accessToken,
        refreshToken: res.refreshToken,
        participant: {
          id: res.participant.id,
          spaceId: res.participant.spaceId,
          name: res.participant.name,
          age: res.participant.age,
          gender: res.participant.gender,
        },
      });
      // The API matches on name, so an existing name hands back that participant and their results.
      toast.success(res.rejoined ? `Welcome back, ${res.participant.name}` : "You have joined the space");
      goto(ROUTES.space);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not join");
    } finally {
      submitting = false;
    }
  };
</script>

{#await space}
  <Skeleton class="h-48 w-full" />
{:then found}
  <Card>
    <CardHeader>
      <CardTitle>{found.title}</CardTitle>
      <CardDescription>
        Enter your name to take part. No account is needed — this device stays signed in as you, and
        entering a name you have used here before brings back your previous results.
      </CardDescription>
    </CardHeader>

    <CardContent>
      <form class="space-y-5" onsubmit={join}>
        <div class="space-y-1.5">
          <Label for="join-name">Name</Label>
          <Input id="join-name" class="h-11 text-base" bind:value={name} required maxlength={255} autocomplete="name" />
          <p class="text-muted-foreground text-xs">
            Shown on the leaderboard. Already taken part? Enter the same name to pick up where you
            left off.
          </p>
        </div>

        <div class="grid gap-4 sm:grid-cols-2">
          <div class="space-y-1.5">
            <Label for="join-age">Age</Label>
            <Input id="join-age" type="number" min="1" max="120" inputmode="numeric" class="h-11 text-base" bind:value={age} />
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

        <p class="text-muted-foreground text-xs">
          Age and gender are optional, but some challenges score against age and gender bands and
          cannot award points without them. You can add or change them later. If you are returning,
          leaving them blank keeps what you entered before.
        </p>

        <Button type="submit" size="lg" class="h-11 w-full sm:w-auto" disabled={submitting || name.trim() === ""}>
          {submitting ? "Joining…" : "Continue"}
        </Button>
      </form>
    </CardContent>
  </Card>
{:catch}
  <Alert variant="destructive">
    <AlertTitle>Space not found</AlertTitle>
    <AlertDescription>
      This join link does not point at a space. Check it with the organiser.
    </AlertDescription>
  </Alert>
{/await}
