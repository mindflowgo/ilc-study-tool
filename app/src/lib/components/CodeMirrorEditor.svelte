<script lang="ts">
  import { EditorView, drawSelection, dropCursor } from '@codemirror/view';
  import { EditorState } from '@codemirror/state';
  import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
  import { bracketMatching } from '@codemirror/language';
  import { keymap } from '@codemirror/view';
  import { onMount } from 'svelte';
  import { liveMarkdown } from '$lib/editor';

  interface Props {
    value: string;
    courseId?: string;
    onChange?: (val: string) => void;
    onSave?: () => void;
  }

  let { value, courseId = '', onChange, onSave }: Props = $props();

  let editorContainer: HTMLDivElement;
  let view: EditorView | null = null;
  let lastValue = '';

  onMount(() => {
    lastValue = value || '';

    const saveKeybinding = keymap.of([
      {
        key: 'Mod-s',
        run: () => {
          if (onSave) onSave();
          return true;
        }
      },
      ...defaultKeymap,
      ...historyKeymap
    ]);

    const state = EditorState.create({
      doc: lastValue,
      extensions: [
        liveMarkdown({ courseId }),
        history(),
        drawSelection(),
        dropCursor(),
        bracketMatching(),
        saveKeybinding,
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            const newDoc = update.state.doc.toString();
            lastValue = newDoc;
            if (onChange) {
              onChange(newDoc);
            }
          }
        }),
      ]
    });

    view = new EditorView({
      state,
      parent: editorContainer
    });

    return () => {
      view?.destroy();
      view = null;
    };
  });

  // Watch for external updates (e.g. switching tabs or lessons)
  $effect(() => {
    const val = value || '';
    if (view && val !== lastValue) {
      lastValue = val;
      const currentDoc = view.state.doc.toString();
      if (val !== currentDoc) {
        const currentSelection = view.state.selection;
        view.dispatch({
          changes: { from: 0, to: currentDoc.length, insert: val },
          selection: currentSelection.main.head <= val.length ? currentSelection : undefined
        });
      }
    }
  });
</script>

<div
  bind:this={editorContainer}
  class="h-full w-full overflow-hidden bg-white border border-stone-200 rounded-xl shadow-2xs focus-within:ring-2 focus-within:ring-amber-500/20 transition"
></div>

<style>
  :global(.cm-editor) {
    height: 100%;
  }
  :global(.cm-scroller) {
    overflow: auto;
  }
</style>
