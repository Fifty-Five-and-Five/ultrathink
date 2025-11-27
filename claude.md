# Claude Code Instructions for UltraThink

## Post-Update Checklist

After every code update, you MUST:

1. **Update version number** in all three locations:
   - `ultrathink-extension/manifest.json` - line 4: `"version": "X.Y.Z"`
   - `ultrathink-extension/popup.html` - version span: `<span class="version">vX.Y.Z</span>`
   - `README.md` - Version History section (add new entry at top)

2. **Version numbering convention**:
   - MAJOR (X): Breaking changes or major new features
   - MINOR (Y): New features, significant improvements
   - PATCH (Z): Bug fixes, small improvements, refactoring

## Project Notes

- The OpenAI Responses API (`/v1/responses`) and `gpt-5-nano` model are valid - they were introduced after Claude's January 2025 training cutoff. Do not flag these as errors.

- Content scripts (`pinned-dialog.js`, `selection-overlay.js`) cannot use `importScripts()` - they must include inline loggers.

- The `selectedText` field is separate from `notes` - selected text is captured from the page, notes are user commentary.

## Current Version

**v2.3.0** (2025-11-27)
