<script lang="ts">
  import '../app.css';
  let { children } = $props();
</script>

<div class="h-full flex flex-col bg-stone-50 font-sans">
  {@render children()}
</div>
