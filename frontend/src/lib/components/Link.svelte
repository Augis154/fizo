<script lang="ts" generics="R extends Route">
  import type { Snippet } from "svelte";
  import type { HTMLAnchorAttributes } from "svelte/elements";

  import { location, navigate } from "$lib/router.svelte";
  import { buildPath, type ParamsOf, type Route } from "$lib/routes";
  import { cn } from "$lib/utils";

  type Props = Omit<HTMLAnchorAttributes, "href"> & {
    /** A route from `ROUTES`, not a path — e.g. `to={ROUTES.challenge}`. */
    to: R;
    /** Required for routes with `:params`, rejected for those without. */
    params?: Record<ParamsOf<R>, string>;
    children: Snippet;
  };

  let { to, params, class: className, children, ...rest }: Props = $props();

  const target = $derived(buildPath(to.path, params));

  const active = $derived(location.path === target);

  // Let modified clicks and middle clicks open a new tab, as a real link should.
  const onclick = (event: MouseEvent) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    navigate(target);
  };
</script>

<a href={target} {onclick} data-active={active || undefined} class={cn(className)} {...rest}>
  {@render children()}
</a>
