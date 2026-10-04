/**
 * The editable inputs inside a rendered block (frontmatter properties, table cells).
 */

export interface FieldOptions {
  className: string;
  value: string;
  onInput: (value: string) => void;
  onCommit?: () => void;
  placeholder?: string;
}

/** Grows a textarea to fit what it holds, so a long value wraps rather than scrolls. */
function fit(field: HTMLTextAreaElement) {
  field.style.height = "auto";
  field.style.height = `${field.scrollHeight}px`;
}

function shared(field: HTMLInputElement | HTMLTextAreaElement, options: FieldOptions) {
  field.className = options.className;
  field.value = options.value;
  field.spellcheck = false;
  if (options.placeholder) field.placeholder = options.placeholder;

  field.addEventListener("keydown", (event) => {
    event.stopPropagation();
    if ((event as KeyboardEvent).key === "Escape") {
      event.preventDefault();
      field.blur();
    }
  });

  field.addEventListener("mousedown", (event) => event.stopPropagation());
  field.addEventListener("input", () => options.onInput(field.value));
}

export function textField(options: FieldOptions): HTMLInputElement {
  const field = document.createElement("input");
  field.type = "text";
  shared(field, options);

  field.addEventListener("keydown", (event: KeyboardEvent) => {
    if (event.key === "Enter") {
      event.preventDefault();
      options.onCommit?.();
    }
  });

  return field;
}

export function areaField(options: FieldOptions): HTMLTextAreaElement {
  const field = document.createElement("textarea");
  field.rows = 1;
  shared(field, options);

  field.addEventListener("input", () => fit(field));
  field.addEventListener("keydown", (event: KeyboardEvent) => {
    if (event.key === "Enter") {
      event.preventDefault();
      options.onCommit?.();
    }
  });

  requestAnimationFrame(() => fit(field));
  return field;
}

export function refresh(field: HTMLInputElement | HTMLTextAreaElement, value: string) {
  if (document.activeElement === field || field.value === value) return;
  field.value = value;
  if (field instanceof HTMLTextAreaElement) fit(field);
}
