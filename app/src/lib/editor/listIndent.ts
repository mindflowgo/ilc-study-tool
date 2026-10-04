import { syntaxTree } from "@codemirror/language";
import { EditorState, Line, Range, StateEffect, StateField, Text } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView, ViewPlugin, ViewUpdate } from "@codemirror/view";
import type { SyntaxNode } from "@lezer/common";
import { contentStart } from "./lists";

interface Prefix {
  key: string;
  from: number;
  to: number;
}

interface ListLine {
  from: number;
  prefix: Prefix;
  anchor: Prefix;
  quoted: boolean;
}

interface Widths {
  scale: number;
  widths: ReadonlyMap<string, number>;
}

const EMPTY_WIDTHS: Widths = { scale: 0, widths: new Map() };

const measured = StateEffect.define<{ scale: number; widths: [string, number][] }>();

export const prefixWidths = StateField.define<Widths>({
  create: () => EMPTY_WIDTHS,

  update(value, transaction) {
    for (const effect of transaction.effects) {
      if (!effect.is(measured)) continue;

      const widths = new Map(effect.value.scale === value.scale ? value.widths : []);
      for (const [key, width] of effect.value.widths) widths.set(key, width);
      value = { scale: effect.value.scale, widths };
    }
    return value;
  },
});

function depthOf(item: SyntaxNode): number {
  let depth = -1;
  for (let node: SyntaxNode | null = item.parent; node; node = node.parent) {
    if (node.name === "BulletList" || node.name === "OrderedList") depth++;
  }
  return Math.max(0, depth);
}

function isQuoted(item: SyntaxNode): boolean {
  for (let node: SyntaxNode | null = item.parent; node; node = node.parent) {
    if (node.name === "Blockquote") return true;
  }
  return false;
}

function indentEnd(doc: Text, line: Line): number {
  let at = line.from;
  while (at < line.to && /[ \t]/.test(doc.sliceString(at, at + 1))) at++;
  return at;
}

function prefixOf(doc: Text, from: number, to: number, kind: string): Prefix {
  return { key: from === to ? "" : `${kind}:${doc.sliceString(from, to)}`, from, to };
}

function listLines(state: EditorState, from: number, to: number): ListLine[] {
  const doc = state.doc;
  const lines: ListLine[] = [];
  const firstVisible = doc.lineAt(from).number;
  const lastVisible = doc.lineAt(to).number;

  syntaxTree(state).iterate({
    from,
    to,
    enter: (node) => {
      if (node.name !== "ListItem") return;

      const item = node.node;
      const opening = doc.lineAt(item.from);
      const text = contentStart(doc, item, opening);
      if (text === null) return;

      const anchor = prefixOf(doc, opening.from, text, `${depthOf(item)}`);
      const quoted = isQuoted(item);

      const nested: SyntaxNode[] = [];
      for (let child = item.firstChild; child; child = child.nextSibling) {
        if (child.name === "BulletList" || child.name === "OrderedList") nested.push(child);
      }

      const last = Math.min(doc.lineAt(item.to).number, lastVisible);
      for (let number = Math.max(opening.number, firstVisible); number <= last; number++) {
        const line = doc.line(number);
        if (nested.some((child) => child.from <= line.to && child.to >= line.from)) continue;

        lines.push({
          from: line.from,
          prefix: number === opening.number ? anchor : prefixOf(doc, line.from, indentEnd(doc, line), "ws"),
          anchor,
          quoted,
        });
      }
    },
  });

  return lines;
}

function widthOf(view: EditorView, prefix: Prefix): number | null {
  const start = view.coordsAtPos(prefix.from, 1);
  const end = view.coordsAtPos(prefix.to, 1);
  if (!start || !end) return null;
  return Math.max(0, Math.round((end.left - start.left) * 100) / 100);
}

function scaleOf(view: EditorView): number {
  return Math.round(view.defaultCharacterWidth * 100) / 100;
}

function widthFor({ widths }: Widths, prefix: Prefix): number | undefined {
  return prefix.key === "" ? 0 : widths.get(prefix.key);
}

function indentDecoration(indent: number, hang: number, quoted: boolean): Decoration {
  const start = quoted ? `calc(1em + ${indent}px)` : `${indent}px`;
  return Decoration.line({
    attributes: { style: `padding-left:${start};text-indent:${-hang}px` },
  });
}

function build(view: EditorView): DecorationSet {
  const known = view.state.field(prefixWidths);
  const out: Range<Decoration>[] = [];

  for (const { from, to } of view.visibleRanges) {
    for (const line of listLines(view.state, from, to)) {
      const indent = widthFor(known, line.anchor);
      const hang = widthFor(known, line.prefix);
      if (indent === undefined || hang === undefined || indent === 0) continue;

      out.push(indentDecoration(indent, hang, line.quoted).range(line.from));
    }
  }

  return Decoration.set(out, true);
}

export const listIndentation = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    dispatched = "";
    alive = true;

    constructor(view: EditorView) {
      this.decorations = build(view);
      this.measure(view);
    }

    update(update: ViewUpdate) {
      if (
        !update.docChanged &&
        !update.viewportChanged &&
        !update.geometryChanged &&
        update.startState.field(prefixWidths) === update.state.field(prefixWidths)
      ) {
        return;
      }

      this.decorations = build(update.view);
      this.measure(update.view);
    }

    measure(view: EditorView) {
      const known = view.state.field(prefixWidths);
      const scale = scaleOf(view);
      const wanted = new Map<string, Prefix>();

      for (const { from, to } of view.visibleRanges) {
        for (const line of listLines(view.state, from, to)) {
          for (const prefix of [line.anchor, line.prefix]) {
            if (prefix.key === "" || wanted.has(prefix.key)) continue;
            if (known.scale === scale && known.widths.has(prefix.key)) continue;
            wanted.set(prefix.key, prefix);
          }
        }
      }

      if (wanted.size === 0) return;

      view.requestMeasure({
        read: () => Array.from(wanted.values(), (prefix) => [prefix.key, widthOf(view, prefix)] as const),
        write: (taken) => {
          const widths = taken.filter((entry): entry is [string, number] => entry[1] !== null);
          if (widths.length === 0) return;

          const signature = `${scale}|${widths.map(([key]) => key).join("\u0000")}`;
          if (signature === this.dispatched) return;

          this.dispatched = signature;
          queueMicrotask(() => {
            if (this.alive) view.dispatch({ effects: measured.of({ scale, widths }) });
          });
        },
      });
    }

    destroy() {
      this.alive = false;
    }
  },
  { decorations: (plugin) => plugin.decorations }
);

export const listIndent = [prefixWidths, listIndentation];
