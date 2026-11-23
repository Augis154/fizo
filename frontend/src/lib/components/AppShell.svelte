<script lang="ts">
  import type { Snippet } from "svelte";

  import Link from "$lib/components/Link.svelte";
  import ThemeToggle from "$lib/components/ThemeToggle.svelte";
  import { Button, buttonVariants } from "$lib/components/ui/button";
  import { Separator } from "$lib/components/ui/separator";
  import { goto, ROUTES } from "$lib/routes";
  import { session } from "$lib/session.svelte";

  let { children }: { children: Snippet } = $props();

  const participant = $derived(session.participant);

  const leave = () => {
    session.clear();
    goto(ROUTES.home);
  };
</script>

<div class="bg-background text-foreground min-h-screen">
  <header class="bg-card/50 border-b">
    <div class="mx-auto flex max-w-3xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
      <Link to={ROUTES.home} class="font-semibold tracking-tight">Fizo</Link>

      {#if participant}
        <nav class="flex items-center gap-1 text-sm">
          <Link to={ROUTES.space} class={buttonVariants({ variant: "ghost", size: "sm" })}>Challenges</Link>
          <Link to={ROUTES.myResults} class={buttonVariants({ variant: "ghost", size: "sm" })}>My results</Link>
        </nav>

      {/if}

      <div class="ml-auto flex items-center gap-1 text-sm">
        {#if participant}
          <span class="text-muted-foreground hidden sm:inline">{participant.name}</span>
          <Button variant="ghost" size="sm" onclick={leave}>Leave</Button>
        {/if}
        <ThemeToggle />
      </div>
    </div>
  </header>

  <main class="mx-auto max-w-3xl space-y-6 px-4 py-6">
    {@render children()}
  </main>

  <footer class="mx-auto max-w-3xl px-4 pb-8">
    <Separator class="mb-4" />
    <p class="text-muted-foreground text-xs">Fizo — sports space results</p>
  </footer>
</div>
