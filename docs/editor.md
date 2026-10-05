# Build Notes on Markdown WYSWIG Editor

The Core Idea: "Line-Based Reveal" (Not Clunky Widgets) -- most WYSIWYG Markdown editors suffer from one of two extremes:

Either they completely hide the Markdown syntax behind popup toolbars and buttons, making precision editing frustrating;
Or they treat Markdown as raw plain text with syntax highlighting, losing the visual hierarchy of headings, tables, and images.

Nuza's solution: The test is by line, not by character.

When your cursor is away from a line, syntax marks (#, **, *, ~~, `, >, [title](url)) are completely hidden (Decoration.replace({})), leaving rendered headings, bold, italic, links, and bullets in place.
The moment your caret lands anywhere on that line, the whole line smoothly "opens up": the syntax markers reappear, dimmed to a subtle muted tone (.cm-md-mark).
This makes editing feel like writing natural text with full Markdown control, rather than fighting with fragile graphical widgets.
2. AST-Driven Decoration with Lezer Markdown

Instead of using brittle regular expressions over the entire document, the live preview uses the @lezer/markdown AST syntax tree (syntaxTree(state)):

Matches specific syntax nodes: ATXHeading1-6, StrongEmphasis, Emphasis, Strikethrough, InlineCode, Link, Blockquote, ListMark, TaskMarker, Table, HorizontalRule.
Headings are assigned line classes (cm-md-heading cm-md-h1..h6) so font sizes, line heights, and margins scale proportionally directly in the editor.
3. Block-Widened Incremental Rebuilding (60fps Typing)

In a long lesson or study summary (thousands of lines), re-evaluating the whole document on every keystroke would cause noticeable typing lag.

From Nuza’s livePreview.ts:

Implemented as a StateField<DecorationSet>.
When an edit or caret move occurs, it calls widen(state, tree, span), expanding the affected area only to the outermost enclosing block (the paragraph, list item, or table).
It remaps the unchanged decorations across the transaction (decorations.map(changes)) and only rebuilds decorations for the active span. Typing remains instantaneous regardless of file length.
4. Self-Updating Interactive Widgets (WidgetType)

Nuza introduced custom CodeMirror widgets that are directly interactive rather than static HTML:

Interactive Task Checkboxes (TaskWidget):
Replaces - [ ] and - [x] with a real checkbox.
Clicking the checkbox dispatches a transaction straight to the document at that exact position, toggling [ ] 
↔
↔ [x].
Checked tasks automatically receive line strikethrough (cm-md-task-done).
updateDOM reuses the existing DOM node so the checkmark animates smoothly.
GFM Tables (TableWidget):
Delimiter rows (| :--- | :---: |) and table cells are parsed into formatted HTML tables with borders and alignment.
Clicking a cell turns it into an inline editable <input> right in the table, writing changes back to Markdown. Double-clicking reveals the raw Markdown table.
Images (ImageWidget):
Replaces ![alt](url) with an <img> element with smooth fade-in loading and broken image fallback.
Adapted for our study tool to automatically resolve course asset paths (./assets/... 
→
→ /api/courses/${courseId}/assets/...) and respect Obsidian pipe sizing (![alt|350](...), ![alt|50%](...)).
Contextual Bullets (BulletWidget):
Replaces - and * with depth-aware glyphs (•, ◦, ▪).
Properties / YAML Frontmatter (PropertiesWidget):
Parses --- frontmatter at the top of the file into a clean properties block with key-value fields and + Add property action. Placing the cursor into the block reveals the raw YAML text.
Horizontal Rules (RuleWidget):
Replaces --- and *** with a sleek divider line.
5. Smart List Continuation & Renumbering (lists.ts & listIndent.ts)

Standard CodeMirror commands don't know how to handle complex lists. Nuza's list engine was brought in:

Pressing Enter in a bullet item automatically creates a new bullet.
Pressing Enter on a task automatically creates an empty - [ ] task.
Pressing Enter on an ordered numbered list automatically continues the count and renumbers subsequent items.
Pressing Enter on an empty list item exits the list.
Shift+Enter creates a soft continuation line indented beneath the text without adding a new bullet.
Hanging Indents (listIndent.ts): Measures line prefixes dynamically so wrapped lines hang under the text rather than under the bullet.
6. Obsidian-Style Link Navigation
openLinkOnModClick:
A plain click keeps the caret in the editor so you can edit the link text or URL.
Cmd-Click (Mac) or Ctrl-Click (Windows) opens the link in a browser tab.
7. Proportional Study Typography
Replaced the monospace code-editor styling (gutters, line numbers, code font) with a proportional, high-legibility sans-serif reading font matching the rest of the study tool (theme.ts).
Line height is increased to 1.7 with balanced column padding, warm amber carets, and stone accents.
