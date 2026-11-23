<script lang="ts">
  import Link from "$lib/components/Link.svelte";
  import { Button, buttonVariants } from "$lib/components/ui/button";
  import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "$lib/components/ui/card";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import { goto, ROUTES } from "$lib/routes";
  import { session } from "$lib/session.svelte";

  const participant = $derived(session.participant);

  let code = $state("");

  const open = (event: SubmitEvent) => {
    event.preventDefault();
    const shortId = code.trim();
    if (shortId) goto(ROUTES.join, { shortId });
  };
</script>

<Card>
  <CardHeader>
    <CardTitle>Record your results</CardTitle>
    <CardDescription>
      Enter what you achieved in a sports space's challenges, see your points worked out against its
      scoring rules, and follow your progress on the leaderboard.
    </CardDescription>
  </CardHeader>

  <CardContent class="space-y-6">
    {#if participant}
      <div class="space-y-3">
        <p class="text-sm">
          You are taking part as <span class="font-medium">{participant.name}</span>.
        </p>
        <Link to={ROUTES.space} class={buttonVariants()}>Go to challenges</Link>
      </div>
    {:else}
      <p class="text-muted-foreground text-sm">
        Organisers invite participants with a join link. Open the link you were given, or enter its
        code below.
      </p>

      <form class="flex items-end gap-2" onsubmit={open}>
        <div class="flex-1 space-y-1.5">
          <Label for="join-code">Join code</Label>
          <Input id="join-code" class="h-11 text-base" bind:value={code} autocomplete="off" />
        </div>
        <Button type="submit" size="lg" class="h-11" disabled={code.trim() === ""}>Open</Button>
      </form>
    {/if}
  </CardContent>
</Card>
