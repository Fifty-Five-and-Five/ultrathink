# Development Notes

## Important: Reloading the Extension

**ALWAYS increment the version number in `manifest.json` when you make changes to extension files.**

Edge caches extension files aggressively. If you modify any extension files and just click "Reload", your changes may not take effect.

### When to Update Version

Update version in `manifest.json` when changing:
- `manifest.json` itself
- `popup.html` / `popup.js`
- `background.js`
- `options.html` / `options.js`
- Any extension file

### You DON'T Need to Update Version

- Changes to `native-host/host.py` (launched fresh each time)
- Changes to .bat files
- Registry changes

### Version Format

```json
"version": "1.0.0"
```

Increment the last number for each change:
- `1.0.0` → `1.0.1` → `1.0.2` etc.

### Reload Process

1. Edit files
2. Update version in `manifest.json`
3. Go to `edge://extensions/`
4. Click reload icon on "UltraThink URL Saver"
5. Test your changes

## Current Keyboard Shortcuts

**Ctrl+Shift+4** - Opens the save popup (default, you configured it in browser)
**Ctrl+Shift+5** - Capture screenshot and save to KB

To customize:
- Go to `edge://extensions/shortcuts`
- Find "UltraThink URL Saver"
- Change the shortcuts

## File Changes That Take Effect Immediately

- `native-host/host.py` - No extension reload needed
- `kb.md` - Just a data file

## Debugging

- Extension popup console: Right-click popup → Inspect
- Background service worker: `edge://extensions/` → Inspect views: service worker
- Native host logs: `native-host/host.log`
- Python errors: Check `host.log` file
