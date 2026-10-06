<script lang="ts">
  import '../app.css';
  import { initApiInterceptor } from '$lib/api';

  initApiInterceptor();

  let { children } = $props();
</script>

<div class="h-full flex flex-col bg-stone-50 font-sans">
  {@render children()}
</div>
