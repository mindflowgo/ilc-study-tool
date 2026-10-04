import { syntaxTree } from "@codemirror/language";
import { type ChangeSpec, EditorSelection, EditorState, Line, Text } from "@codemirror/state";
import type { Command } from "@codemirror/view";
import type { SyntaxNode } from "@lezer/common";

export function firstChild(node: SyntaxNode, name: string): SyntaxNode | null {
  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (child.name === name) return child;
  }
  return null;
}

export function listItemAt(state: EditorState, pos: number): SyntaxNode | null {
  for (let node: SyntaxNode | null = syntaxTree(state).resolveInner(pos, -1); node; node = node.parent) {
    if (node.name === "ListItem") return node;
  }
  return null;
}

function markerEnd(doc: Text, item: SyntaxNode, line: Line): number | null {
  const mark = firstChild(item, "ListMark");
  if (!mark) return null;

  let at = mark.to;
  while (at < line.to && doc.sliceString(at, at + 1) === " ") at++;
  return at;
}

export function contentStart(doc: Text, item: SyntaxNode, line: Line): number | null {
  const end = markerEnd(doc, item, line);
  if (end === null) return null;

  const marker = firstChild(item, "Task") && firstChild(firstChild(item, "Task")!, "TaskMarker");
  if (!marker) return end;

  let at = marker.to;
  while (at < line.to && doc.sliceString(at, at + 1) === " ") at++;
  return at;
}

function continuation(doc: Text, item: SyntaxNode): string | null {
  const line = doc.lineAt(item.from);
  const end = markerEnd(doc, item, line);
  if (end === null) return null;

  return doc.sliceString(line.from, end).replace(/[^\t>]/g, " ");
}

export const continueListItem: Command = (view) => {
  const { state } = view;
  const items = state.selection.ranges.map((range) => listItemAt(state, range.head));
  if (!items.some(Boolean)) return false;

  let index = 0;
  const change = state.changeByRange((range) => {
    const item = items[index++];
    const indent = item ? continuation(state.doc, item) : null;
    const insert = state.lineBreak + (indent ?? "");

    return {
      changes: { from: range.from, to: range.to, insert },
      range: EditorSelection.cursor(range.from + insert.length),
    };
  });

  view.dispatch(state.update(change, { scrollIntoView: true, userEvent: "input" }));
  return true;
};

function nextMarker(doc: Text, item: SyntaxNode): string | null {
  const line = doc.lineAt(item.from);
  const end = markerEnd(doc, item, line);
  if (end === null) return null;

  const marker = doc.sliceString(line.from, end);
  if (firstChild(item, "Task")) return `${marker}[ ] `;

  return marker.replace(/\d+(?=[.)]\s*$)/, (number) => String(Number(number) + 1));
}

function itemNumber(doc: Text, item: SyntaxNode): RegExpExecArray | null {
  return /^(\s*)(\d+)(?=[.)])/.exec(doc.sliceString(item.from, item.from + 12));
}

function renumber(doc: Text, item: SyntaxNode, changes: ChangeSpec[]): void {
  let previous = -1;

  for (let node: SyntaxNode | null = item; node; node = node.nextSibling) {
    if (node.name !== "ListItem") continue;

    const match = itemNumber(doc, node);
    if (!match) return;

    const number = Number(match[2]);
    if (previous >= 0) {
      if (number !== previous + 1) return;
      changes.push({
        from: node.from + match[1].length,
        to: node.from + match[0].length,
        insert: String(number + 1),
      });
    }
    previous = number;
  }
}

const startListItem: Command = (view) => {
  const { state } = view;
  const { doc } = state;
  const ranges = state.selection.ranges;

  const items = ranges.map((range) => {
    if (!range.empty) return null;

    const item = listItemAt(state, range.head);
    const line = doc.lineAt(range.head);
    if (!item || item.from >= line.from || !/\S/.test(line.text)) return null;
    return item;
  });

  if (!items.some(Boolean)) return false;

  let index = 0;
  const change = state.changeByRange((range) => {
    const item = items[index++];
    const marker = item && nextMarker(doc, item);
    if (!marker) return { range };

    const changes: ChangeSpec[] = [];
    if (item.parent?.name === "OrderedList") renumber(doc, item, changes);

    const insert = state.lineBreak + marker;
    changes.push({ from: range.from, to: range.to, insert });

    return { changes, range: EditorSelection.cursor(range.from + insert.length) };
  });

  view.dispatch(state.update(change, { scrollIntoView: true, userEvent: "input" }));
  return true;
};

const leaveListItem: Command = (view) => {
  const { state } = view;
  const { doc } = state;

  const blank = state.selection.ranges.map((range) => {
    if (!range.empty) return false;

    const line = doc.lineAt(range.head);
    if (range.head !== line.to || !line.text || /\S/.test(line.text)) return false;
    return line.from > 0 && !!listItemAt(state, doc.lineAt(line.from - 1).to);
  });

  if (!blank.some(Boolean)) return false;

  let index = 0;
  const change = state.changeByRange((range) => {
    if (!blank[index++]) return { range };

    const line = doc.lineAt(range.head);
    return {
      changes: { from: line.from, to: range.head, insert: "" },
      range: EditorSelection.cursor(line.from),
    };
  });

  view.dispatch(state.update(change, { scrollIntoView: true, userEvent: "delete" }));
  return true;
};

export function insertNewLine(continueMarkup: Command): Command {
  return (view) => startListItem(view) || leaveListItem(view) || continueMarkup(view);
}
