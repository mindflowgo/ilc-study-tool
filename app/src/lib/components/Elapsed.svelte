<script lang="ts">
  interface Props {
    since?: string;
    class?: string;
  }

  let { since, class: className = '' }: Props = $props();

  let now = $state(Date.now());

  $effect(() => {
    if (!since) return;
    now = Date.now();
    const timer = setInterval(() => {
      now = Date.now();
    }, 1000);
    return () => clearInterval(timer);
  });

  let label = $derived.by(() => {
    if (!since) return '';
    const started = new Date(since).getTime();
    if (Number.isNaN(started)) return '';
    const total = Math.max(0, Math.floor((now - started) / 1000));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = total % 60;
    const mm = String(minutes).padStart(hours > 0 ? 2 : 1, '0');
    const ss = String(seconds).padStart(2, '0');
    return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
  });
</script>

{#if label}
  <span class={className}>{label}</span>
{/if}
