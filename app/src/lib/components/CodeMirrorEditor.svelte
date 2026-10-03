<script lang="ts">
  import { EditorView, basicSetup } from 'codemirror';
  import { markdown } from '@codemirror/lang-markdown';
  import { EditorState } from '@codemirror/state';
  import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
  import { keymap } from '@codemirror/view';
  import { onMount } from 'svelte';

  interface Props {
    value: string;
    onChange?: (val: string) => void;
    onSave?: () => void;
  }

  let { value, onChange, onSave }: Props = $props();

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
        basicSetup,
        markdown(),
        EditorView.lineWrapping,
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
        EditorView.theme({
          '&': {
            height: '100%',
            backgroundColor: '#ffffff'
          },
          '.cm-scroller': {
            fontFamily: 'JetBrains Mono, ui-monospace, monospace',
            fontSize: '13px',
            lineHeight: '1.6',
            padding: '12px 0'
          },
          '.cm-content': {
            padding: '0 16px'
          },
          '.cm-gutters': {
            backgroundColor: '#fafaf9',
            color: '#a8a29e',
            borderRight: '1px solid #e7e5e4'
          },
          '&.cm-focused .cm-cursor': {
            borderLeftColor: '#1c1917'
          },
          '.cm-activeLine': {
            backgroundColor: '#f5f5f4'
          },
          '.cm-activeLineGutter': {
            backgroundColor: '#e7e5e4',
            color: '#44403c'
          }
        })
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

<div bind:this={editorContainer} class="h-full w-full overflow-hidden border border-stone-200 rounded-lg shadow-2xs"></div>
