# 测试用例索引

## App Startup (`specs/app-startup.spec.ts`)

- [x] should load the app shell
- [x] should show the sidebar
- [x] should initialize CodeMirror editor
- [x] should show the status bar with defaults
- [x] should show empty folder prompt

## Navigation (`specs/navigation.spec.ts`)

- [x] should start on the editor page
- [x] should navigate to settings page
- [x] should navigate back to editor from settings
- [x] should show all settings nav items
- [x] should switch settings sections

## Editor Input (`specs/editor-input.spec.ts`)

- [x] should type text into the editor
- [x] should type multi-line text
- [x] should delete text with backspace
- [x] should update word count in status bar
- [x] should update cursor position in status bar
- [x] should select all text
- [x] should clear editor and set new content

## Editor Formatting (`specs/editor-format.spec.ts`)

- [x] should show selection toolbar when text is selected
- [x] should apply bold via toolbar
- [x] should apply italic via toolbar
- [x] should show heading buttons in toolbar
- [x] should apply H1 via toolbar
- [x] should show context menu on right click
- [x] should apply strikethrough via toolbar
- [x] should apply H2 via toolbar
- [x] should apply H3 via toolbar
- [x] should apply H4 via toolbar
- [x] should apply code via toolbar
- [x] should apply blockquote via toolbar
- [x] should insert link via toolbar
- [x] should convert to bullet list via toolbar
- [x] should convert to ordered list via toolbar

## Editor Shortcuts (`specs/editor-shortcuts.spec.ts`)

### Inline Formatting
- [x] Cmd+B wraps selection in bold
- [x] Cmd+I wraps selection in italic
- [x] Cmd+Shift+S wraps selection in strikethrough
- [x] Cmd+` wraps selection in code
- [x] Cmd+K inserts link

### Block Type
- [x] Cmd+1 converts to H1
- [x] Cmd+2 converts to H2
- [x] Cmd+3 converts to H3
- [x] Cmd+4 converts to H4
- [x] Cmd+0 removes heading
- [x] Cmd+Shift+8 converts to bullet list
- [x] Cmd+Shift+9 converts to numbered list
- [x] Cmd+Shift+. converts to blockquote

### Misc
- [x] Cmd+Enter toggles checkbox (unchecked -> checked)
- [x] Cmd+Enter toggles checkbox (checked -> unchecked)

## Slash Commands (`specs/editor-slash.spec.ts`)

- [x] should show slash menu when typing / at line start
- [x] should show all command items
- [x] should filter commands when typing after /
- [x] should select command with Enter key
- [x] should select command with mouse click
- [x] should close menu with Escape
- [x] should show empty message when no match

## Block Type Input (`specs/editor-blocks.spec.ts`)

- [x] should create H1 when typing #
- [x] should create H2 when typing ##
- [x] should create H3 when typing ###
- [x] should create H4 when typing ####
- [x] should create bullet list when typing -
- [x] should create numbered list when typing 1.
- [x] should create todo when typing - [ ]
- [x] should create blockquote when typing >
- [x] should create code block when typing ``` + Enter

## Context Menu (`specs/editor-context-menu.spec.ts`)

- [x] should show Cut option
- [x] should show Copy option
- [x] should show Paste option
- [x] should show Refresh option
- [x] should close context menu on Escape
- [x] should close context menu when clicking elsewhere
- [x] should show table context menu options

## Table Editing (`specs/editor-table.spec.ts`)

- [x] should render table from markdown
- [x] should display table cells
- [x] should allow editing a table cell
- [x] should show table context menu
- [x] should add row via context menu
- [x] should add column via context menu

## Drag Sort (`specs/editor-drag.spec.ts`)

- [x] should show drag handles in gutter
- [x] should reorder blocks by dragging

## Settings Navigation (`specs/settings.spec.ts`)

- [x] should display general section by default
- [x] should switch to editor section
- [x] should switch to git section
- [x] should switch to about section
- [x] should have a back button to return to editor

## Settings Interactions (`specs/settings-interact.spec.ts`)

- [x] should show theme buttons in General section
- [x] should toggle theme from Light to Dark
- [x] should show Auto Save toggle in Editor section
- [x] should toggle Auto Save on and off
- [x] should toggle Line Numbers
- [x] should toggle Word Wrap
- [x] should show Auto Commit toggle in Git section
- [x] should toggle Auto Commit
- [x] should show app info in About section

## 统计

- 总测试数: 92
- Spec 文件数: 12
