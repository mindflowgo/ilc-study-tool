<script lang="ts">
  import '../app.css';
  import { onMount } from 'svelte';
  import { initApiInterceptor } from '$lib/api';
  import { theme } from '$lib/theme.svelte';

  initApiInterceptor();

  onMount(() => {
    theme.init();
  });

  let { children } = $props();
</script>

<div class="h-full flex flex-col bg-stone-50 dark:bg-stone-950 text-stone-900 dark:text-stone-100 font-sans transition-colors duration-150">
  {@render children()}
</div>
