<script lang="ts">
  import type { Component } from "svelte";
  import { ModeWatcher } from "mode-watcher";

  import AppShell from "$lib/components/AppShell.svelte";
  import { Alert, AlertDescription, AlertTitle } from "$lib/components/ui/alert";
  import { Button } from "$lib/components/ui/button";
  import { Toaster } from "$lib/components/ui/sonner";
  import { location, matchRoute } from "$lib/router.svelte";
  import { goto, ROUTES, routeEntries, type RouteName } from "$lib/routes";
  import { session } from "$lib/session.svelte";
  import Challenge from "./routes/Challenge.svelte";
  import History from "./routes/History.svelte";
  import Join from "./routes/Join.svelte";
  import Landing from "./routes/Landing.svelte";
  import Leaderboard from "./routes/Leaderboard.svelte";
  import Space from "./routes/Space.svelte";

  /**
   * The page for each route in `$lib/routes`. Declaring it as a complete `Record<RouteName, …>`
   * means a route added to the config without a page here is a type error.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pages: Record<RouteName, Component<any>> = {
    home: Landing,
    join: Join,
    space: Space,
    challenge: Challenge,
    leaderboard: Leaderboard,
    myResults: History,
  };

  const matched = $derived.by(() => {
    for (const [name, route] of routeEntries) {
      const params = matchRoute(route.path, location.path);
      if (params) return { name, route, params };
    }
    return null;
  });

  const blocked = $derived(matched !== null && matched.route.requiresSession === true && session.participant === null);
</script>

<ModeWatcher />
<Toaster />

<AppShell>
  {#if matched === null}
    <Alert>
      <AlertTitle>Page not found</AlertTitle>
      <AlertDescription>
        Nothing lives at <code>{location.path}</code>.
        <Button variant="link" class="h-auto p-0" onclick={() => goto(ROUTES.home)}>Go to the start</Button>
      </AlertDescription>
    </Alert>
  {:else if blocked}
    <Alert>
      <AlertTitle>Join a space first</AlertTitle>
      <AlertDescription>
        This page is for participants of a sports space. Open the join link your organiser gave you.
        <Button variant="link" class="h-auto p-0" onclick={() => goto(ROUTES.home)}>Enter a join code</Button>
      </AlertDescription>
    </Alert>
  {:else}
    {@const Page = pages[matched.name]}
    <!-- Keyed so switching between two matches of the same route remounts with fresh state. -->
    {#key location.path}
      <Page {...matched.params} />
    {/key}
  {/if}
</AppShell>
