<script lang="ts">
  import MonitorIcon from "@lucide/svelte/icons/monitor";
  import MoonIcon from "@lucide/svelte/icons/moon";
  import SunIcon from "@lucide/svelte/icons/sun";
  import { mode, resetMode, setMode, userPrefersMode } from "mode-watcher";

  import { Button } from "$lib/components/ui/button";
  import * as DropdownMenu from "$lib/components/ui/dropdown-menu";

  /**
   * `userPrefersMode` is the choice ("light" | "dark" | "system"), while `mode` is what is actually
   * being shown — they differ under "system", where the icon should follow the OS.
   */
  const options = [
    { value: "light", label: "Light", icon: SunIcon },
    { value: "dark", label: "Dark", icon: MoonIcon },
    { value: "system", label: "System", icon: MonitorIcon },
  ] as const;

  const apply = (value: string) => {
    if (value === "system") {
      resetMode();
    } else if (value === "light" || value === "dark") {
      setMode(value);
    }
  };
</script>

<DropdownMenu.Root>
  <DropdownMenu.Trigger>
    {#snippet child({ props })}
      <Button {...props} variant="ghost" size="icon" aria-label="Change theme">
        <!-- The trigger shows the mode in effect, so "system" renders as the OS's choice. -->
        {#if mode.current === "dark"}
          <MoonIcon class="size-4" />
        {:else}
          <SunIcon class="size-4" />
        {/if}
      </Button>
    {/snippet}
  </DropdownMenu.Trigger>

  <DropdownMenu.Content align="end" class="min-w-36">
    <DropdownMenu.RadioGroup value={userPrefersMode.current} onValueChange={apply}>
      {#each options as option (option.value)}
        <DropdownMenu.RadioItem value={option.value}>
          <option.icon class="size-4" />
          {option.label}
        </DropdownMenu.RadioItem>
      {/each}
    </DropdownMenu.RadioGroup>
  </DropdownMenu.Content>
</DropdownMenu.Root>
