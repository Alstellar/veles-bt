# Veles MCP Bridge (Phase A)

Package: `veles-mcp-bridge` — local **read-only** MCP companion for the Veles Helper browser extension.

Agents (Cursor, Claude Desktop, etc.) talk to this process over **stdio MCP**.  
The companion bridges to the extension over **HTTP long-poll on `127.0.0.1`** (Firefox-safe; no WebSocket).

**Extension side:** `src/mcp-bridge/` (background client, settings, keepalive).

```
AI client ──stdio──▶ companion ──HTTP long-poll──▶ extension background ──▶ storage / IDB / connection
```

Phase A tools do **not** start backtests. Popup may stay closed.

### Firefox background lifecycle

Firefox MV3 uses a non-persistent **event page**. After ~30–90s idle the background
context is terminated (this is normal — about:debugging will show it as inactive).
The extension uses **`alarms`** (staggered ~every 20s while MCP is enabled) to re-wake
the page and re-attach the HTTP long-poll. If Settings shows Disconnected after idle,
wait a few seconds for the next alarm, or click **Сохранить и подключить**.

## Install & run

```bash
cd mcp
npm install
npm run build
npm start
# or: node dist/index.js --port 17321 --token <optional-fixed-token>
```

On start, the companion prints **port**, **token**, and an example MCP client config to **stderr**.

## Extension setup

1. Load the built extension (`npm run build` at repo root → `dist/`).
2. Open **Settings → MCP bridge (Phase A)**.
3. Enable MCP, paste **port** and **token** from companion stdout/stderr banner.
4. Status should show **Connected**.
5. Close the popup — bridge stays in background.

## MCP client config example

```json
{
  "mcpServers": {
    "veles-helper": {
      "command": "node",
      "args": [
        "/ABS/PATH/TO/veles-bt/mcp/dist/index.js",
        "--port",
        "17321",
        "--token",
        "PASTE_TOKEN"
      ]
    }
  }
}
```

Prefer fixing `--token` in the client config so the extension does not need a new paste every companion restart.

## Phase A tools

| Tool | Description |
|------|-------------|
| `veles_ping` | Bridge health |
| `veles_get_status` | Versions + MCP flags |
| `veles_get_connection` | Veles session readiness |
| `veles_list_tabs` | Open Veles tabs |
| `veles_list_batches` | History summaries |
| `veles_get_batch` | One batch |
| `veles_list_results` | Paginated results (`batchId`, `limit`, `offset`) |
| `veles_list_templates` | Template summaries |
| `veles_get_template` | Full template |
| `veles_get_settings` | Safe settings snapshot |
| `veles_get_logs` | Recent logs (bounded) |

## Manual test checklist

### Happy path (popup closed)

1. Start companion (`npm start` in `mcp/`).
2. Enable MCP in extension settings with printed port/token.
3. Confirm **Connected**.
4. Close popup/fullscreen UI.
5. From an MCP client (or temporary script), call:
   - `veles_ping`
   - `veles_get_status`
   - `veles_list_batches`
   - `veles_list_templates`
   - `veles_get_settings`
   - `veles_get_logs`
6. With a logged-in Veles tab: `veles_get_connection`, `veles_list_tabs`.
7. With known ids: `veles_get_batch`, `veles_list_results`, `veles_get_template`.

### Error codes

| Case | Expected code |
|------|----------------|
| Companion running, MCP disabled / not connected | `BRIDGE_OFFLINE` |
| Wrong token | connection rejected; stays disconnected |
| `veles_get_batch` missing id | `VALIDATION` |
| Unknown batch/template id | `NOT_FOUND` |
| No Veles tab for connection probe | not-ready / `NO_VELES_TAB` in payload |
| Unknown write tool name | `UNKNOWN_METHOD` |

### Firefox (optional)

1. Load temporary add-on from `dist/`.
2. Same enable + `veles_ping` + one storage read.

## Security

- Binds **`127.0.0.1` only**.
- Session token required.
- Extension MCP is **off by default**.
- Token grants local read access to extension data (batches, templates, logs).

## Out of scope (later phases)

Queue start/stop, matrix, directed search, template mutation, settings write.
