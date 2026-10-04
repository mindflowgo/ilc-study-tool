import { EditorView, WidgetType } from "@codemirror/view";
import { areaField, refresh, textField } from "./fields";
import { type Property, frontmatterRange, readFrontmatter } from "./frontmatter";
import { sanitizeHtml } from "./sanitize";
import { parseEditorImageSpec, safeExternalHref } from "./sources";

const INLINE_PATTERN =
  /(\*\*|__)([\s\S]+?)\1|(\*|_)([\s\S]+?)\3|~~([\s\S]+?)~~|`([^`]+)`|\[([^\]]*)\]\(([^)\s]*)(?:\s+"[^"]*")?\)/g;

export function unescapeCell(text: string): string {
  return text.replace(/\\\|/g, "|");
}

function inlineElement(match: RegExpExecArray): Node {
  if (match[2] !== undefined) return wrap("strong", "cm-md-strong", match[2]);
  if (match[4] !== undefined) return wrap("em", "cm-md-em", match[4]);
  if (match[5] !== undefined) return wrap("span", "cm-md-strike", match[5]);

  if (match[6] !== undefined) {
    const code = document.createElement("code");
    code.className = "cm-md-inline-code";
    code.textContent = match[6];
    return code;
  }

  const link = document.createElement("span");
  link.className = "cm-md-link";
  const href = safeExternalHref(match[8] ?? "");
  if (href) link.dataset.href = href;
  renderInline(link, match[7] ?? "");
  return link;
}

function wrap(tag: string, className: string, text: string): HTMLElement {
  const element = document.createElement(tag);
  element.className = className;
  renderInline(element, text);
  return element;
}

export function renderInline(parent: HTMLElement, text: string): void {
  INLINE_PATTERN.lastIndex = 0;
  const matches: RegExpExecArray[] = [];
  for (let match = INLINE_PATTERN.exec(text); match; match = INLINE_PATTERN.exec(text)) {
    matches.push(match);
  }

  let last = 0;
  for (const match of matches) {
    if (match.index > last) {
      parent.appendChild(document.createTextNode(text.slice(last, match.index)));
    }
    parent.appendChild(inlineElement(match));
    last = match.index + match[0].length;
  }

  if (last < text.length) parent.appendChild(document.createTextNode(text.slice(last)));
}

export class BulletWidget extends WidgetType {
  constructor(readonly depth: number) {
    super();
  }

  eq(other: BulletWidget) {
    return other.depth === this.depth;
  }

  toDOM() {
    const bullet = document.createElement("span");
    bullet.className = "cm-md-bullet";
    bullet.textContent = ["•", "◦", "▪"][this.depth % 3];
    if (this.depth > 0) bullet.style.paddingLeft = `${this.depth * 0.9}em`;
    return bullet;
  }

  ignoreEvent() {
    return false;
  }
}

const MARKER_LENGTH = 3;

export class TaskWidget extends WidgetType {
  constructor(readonly checked: boolean) {
    super();
  }

  eq(other: TaskWidget) {
    return other.checked === this.checked;
  }

  toDOM(view: EditorView) {
    const box = document.createElement("input");
    box.type = "checkbox";
    box.className = "cm-md-task";
    box.setAttribute("aria-label", "Toggle task");

    box.addEventListener("mousedown", (event) => event.preventDefault());

    box.addEventListener("click", () => {
      const at = view.posAtDOM(box);
      const marker = view.state.doc.sliceString(at, at + MARKER_LENGTH);
      if (!/^\[[ xX]\]$/.test(marker)) return;

      view.dispatch({
        changes: { from: at, to: at + MARKER_LENGTH, insert: box.checked ? "[x]" : "[ ]" },
      });
    });

    this.updateDOM(box);
    return box;
  }

  updateDOM(dom: HTMLElement) {
    (dom as HTMLInputElement).checked = this.checked;
    return true;
  }

  ignoreEvent() {
    return true;
  }
}

export class HtmlWidget extends WidgetType {
  constructor(
    readonly html: string,
    readonly courseId: string,
    readonly block: boolean
  ) {
    super();
  }

  eq(other: HtmlWidget) {
    return other.html === this.html && other.courseId === this.courseId && other.block === this.block;
  }

  toDOM() {
    const wrapper = document.createElement(this.block ? "div" : "span");
    wrapper.className = this.block ? "cm-md-html cm-md-html-block" : "cm-md-html";
    wrapper.appendChild(sanitizeHtml(this.html, this.courseId));
    return wrapper;
  }

  ignoreEvent() {
    return false;
  }
}

export class RuleWidget extends WidgetType {
  eq() {
    return true;
  }

  toDOM() {
    const wrapper = document.createElement("div");
    wrapper.className = "cm-md-hr-wrap";

    const rule = document.createElement("hr");
    rule.className = "cm-md-hr";
    wrapper.appendChild(rule);

    return wrapper;
  }
}

export class ImageWidget extends WidgetType {
  constructor(
    readonly src: string,
    readonly rawAlt: string
  ) {
    super();
  }

  eq(other: ImageWidget) {
    return other.src === this.src && other.rawAlt === this.rawAlt;
  }

  toDOM() {
    const { alt, width, height } = parseEditorImageSpec(this.rawAlt);

    const wrapper = document.createElement("span");
    wrapper.className = "cm-md-image";

    const image = document.createElement("img");
    image.src = this.src;
    image.alt = alt;
    image.loading = "lazy";

    let style = "max-width: 100%; object-fit: contain; ";
    if (width) style += `width: ${width}; `;
    if (height) style += `height: ${height}; `;
    if (!width && !height) {
      style += "max-height: 480px; width: auto; ";
    }
    image.style.cssText = style;

    const reveal = () => wrapper.classList.add("cm-md-image-loaded");
    image.addEventListener("load", reveal);

    image.addEventListener("error", () => {
      reveal();
      wrapper.classList.add("cm-md-image-broken");
      wrapper.textContent = alt ? `[Image: ${alt}]` : "[Image not found]";
    });

    wrapper.appendChild(image);
    if (image.complete) reveal();
    return wrapper;
  }
}

export type TableAlignment = "left" | "center" | "right" | null;

export type TableCell = {
  text: string;
  offset: number;
};

export type TableRow = {
  cells: TableCell[];
  header: boolean;
};

export class TableWidget extends WidgetType {
  constructor(
    readonly rows: TableRow[],
    readonly alignment: TableAlignment[],
    readonly key: string
  ) {
    super();
  }

  eq(other: TableWidget) {
    return other.key === this.key;
  }

  private rangeOf(view: EditorView, wrapper: HTMLElement, cell: HTMLElement) {
    const from = view.posAtDOM(wrapper) + Number(cell.dataset.offset);
    return { from, to: from + Number(cell.dataset.length) };
  }

  private render(view: EditorView, wrapper: HTMLElement, cell: HTMLElement) {
    const { from, to } = this.rangeOf(view, wrapper, cell);
    cell.textContent = "";
    renderInline(cell, unescapeCell(view.state.doc.sliceString(from, to)));
  }

  private edit(view: EditorView, wrapper: HTMLElement, cell: HTMLElement) {
    if (cell.querySelector("input")) return;

    const { from, to } = this.rangeOf(view, wrapper, cell);
    const field = textField({
      className: "cm-md-cell",
      value: view.state.doc.sliceString(from, to),
      onInput: (text) => {
        const range = this.rangeOf(view, wrapper, cell);
        const insert = text.replace(/\r?\n/g, " ").replace(/\|/g, "\\|");
        if (view.state.doc.sliceString(range.from, range.to) === insert) return;

        cell.dataset.length = String(insert.length);
        view.dispatch({ changes: { from: range.from, to: range.to, insert } });
      },
      onCommit: () => field.blur(),
    });

    field.addEventListener("blur", () => this.render(view, wrapper, cell));

    cell.textContent = "";
    cell.appendChild(field);
    field.focus();
    field.select();
  }

  toDOM(view: EditorView) {
    const wrapper = document.createElement("div");
    wrapper.className = "cm-md-table-wrap";

    const table = document.createElement("table");
    table.className = "cm-md-table";
    const head = document.createElement("thead");
    const body = document.createElement("tbody");

    for (const row of this.rows) {
      const tr = document.createElement("tr");

      row.cells.forEach((cell, index) => {
        const td = document.createElement(row.header ? "th" : "td");
        const align = this.alignment[index];
        if (align) td.style.textAlign = align;
        td.dataset.offset = String(cell.offset);
        td.dataset.length = String(cell.text.length);
        renderInline(td, unescapeCell(cell.text));
        tr.appendChild(td);
      });

      (row.header ? head : body).appendChild(tr);
    }

    if (head.childNodes.length) table.appendChild(head);
    if (body.childNodes.length) table.appendChild(body);
    wrapper.appendChild(table);

    wrapper.addEventListener("mousedown", (event) => {
      const cell = (event.target as HTMLElement | null)?.closest<HTMLElement>("[data-offset]");
      if (!cell || cell.querySelector("input")) return;

      event.preventDefault();
      this.edit(view, wrapper, cell);
    });

    wrapper.addEventListener("dblclick", (event) => {
      const cell = (event.target as HTMLElement | null)?.closest<HTMLElement>("[data-offset]");
      if (!cell) return;

      event.preventDefault();
      const { from } = this.rangeOf(view, wrapper, cell);
      view.dispatch({ selection: { anchor: Math.min(from, view.state.doc.length) } });
      view.focus();
    });

    return wrapper;
  }

  updateDOM(dom: HTMLElement, view: EditorView) {
    const cells = dom.querySelectorAll<HTMLElement>("[data-offset]");
    const flat = this.rows.flatMap((row) => row.cells);
    if (cells.length !== flat.length) return false;

    flat.forEach((cell, index) => {
      const element = cells[index];
      element.dataset.offset = String(cell.offset);
      element.dataset.length = String(cell.text.length);
      if (!element.querySelector("input")) {
        element.textContent = "";
        renderInline(element, unescapeCell(cell.text));
      }
    });

    void view;
    return true;
  }

  ignoreEvent() {
    return true;
  }
}

export class PropertiesWidget extends WidgetType {
  constructor(
    readonly properties: Property[],
    readonly key: string
  ) {
    super();
  }

  eq(other: PropertiesWidget) {
    return other.key === this.key;
  }

  private current(view: EditorView, index: number) {
    const range = frontmatterRange(view.state.doc);
    if (!range) return null;
    return readFrontmatter(view.state.doc, range)?.[index] ?? null;
  }

  private write(view: EditorView, index: number, part: "key" | "value", text: string) {
    const property = this.current(view, index);
    if (!property) return;

    const [from, to] =
      part === "key" ? [property.keyFrom, property.keyTo] : [property.valueFrom, property.valueTo];
    const insert = text.replace(/\r?\n/g, " ");
    if (view.state.doc.sliceString(from, to) === insert) return;

    view.dispatch({ changes: { from, to, insert } });
  }

  private remove(view: EditorView, index: number) {
    const property = this.current(view, index);
    if (!property) return;

    const line = view.state.doc.lineAt(property.keyFrom);
    view.dispatch({ changes: { from: line.from, to: Math.min(line.to + 1, view.state.doc.length) } });
  }

  toDOM(view: EditorView) {
    const wrapper = document.createElement("div");
    wrapper.className = "cm-md-props";

    this.properties.forEach((property, index) => {
      const row = document.createElement("div");
      row.className = "cm-md-prop";

      const key = textField({
        className: "cm-md-prop-key",
        value: property.key,
        placeholder: "key",
        onInput: (text) => this.write(view, index, "key", text),
        onCommit: () => row.querySelector<HTMLTextAreaElement>(".cm-md-prop-value")?.focus(),
      });

      const value = areaField({
        className: "cm-md-prop-value",
        value: property.value,
        onInput: (text) => this.write(view, index, "value", text),
        onCommit: () => (document.activeElement as HTMLElement | null)?.blur(),
      });

      const remove = document.createElement("button");
      remove.className = "cm-md-prop-remove";
      remove.type = "button";
      remove.textContent = "×";
      remove.title = `Delete ${property.key || "property"}`;
      remove.setAttribute("aria-label", `Delete ${property.key || "property"}`);
      remove.addEventListener("mousedown", (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.remove(view, index);
      });

      row.append(key, value, remove);
      wrapper.appendChild(row);
    });

    const add = document.createElement("button");
    add.className = "cm-md-prop-add";
    add.textContent = "+ Add property";
    add.addEventListener("mousedown", (event) => {
      event.preventDefault();

      const range = frontmatterRange(view.state.doc);
      if (!range) return;

      const at = view.state.doc.line(range.closingLine).from;
      view.dispatch({ changes: { from: at, insert: "key: \n" } });

      requestAnimationFrame(() => {
        const keys = view.dom.querySelectorAll<HTMLInputElement>(".cm-md-prop-key");
        const last = keys[keys.length - 1];
        last?.focus();
        last?.select();
      });
    });
    wrapper.appendChild(add);

    return wrapper;
  }

  updateDOM(dom: HTMLElement, view: EditorView) {
    const rows = dom.querySelectorAll<HTMLElement>(".cm-md-prop");
    if (rows.length !== this.properties.length) return false;

    this.properties.forEach((property, index) => {
      const row = rows[index];
      const key = row.querySelector<HTMLInputElement>(".cm-md-prop-key");
      const value = row.querySelector<HTMLTextAreaElement>(".cm-md-prop-value");
      const remove = row.querySelector<HTMLButtonElement>(".cm-md-prop-remove");
      if (key) refresh(key, property.key);
      if (value) refresh(value, property.value);
      if (remove) {
        const label = `Delete ${property.key || "property"}`;
        remove.title = label;
        remove.setAttribute("aria-label", label);
      }
    });

    void view;
    return true;
  }

  ignoreEvent() {
    return true;
  }
}
