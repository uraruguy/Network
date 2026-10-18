# Connect AI apps to your network (MCP)

The Network runs a [Model Context Protocol](https://modelcontextprotocol.io) server, so assistants
like Claude, ChatGPT, Cursor or Grok can search your people, read your notes and — if you allow it —
add notes, people and follow-ups. It exposes the same tools the in-app assistant uses.

**Server URL:** `https://<your-network>/api/mcp` (Streamable HTTP; shown with a Copy button in
Settings → Connected apps).

## Two ways to sign in

| | For | How |
| --- | --- | --- |
| **OAuth** | Hosted apps that sign you in through the browser and come back to a public `https://` address: claude.ai (web, desktop, mobile), ChatGPT | Add the server URL as a connector, sign in to The Network, choose the access level, Allow. |
| **Personal access token** | Apps on your computer — Claude Code, Cursor, desktop MCP clients, the MCP Inspector, `mcp-remote` — plus scripts and clients that only send a header | Settings → Connected apps → New token. The token (`ntk_…`) is shown **once**. Send it as `Authorization: Bearer ntk_…`. |

The consent page won't approve an app that wants to come back to `localhost`, a private-network
address or a custom app scheme (`cursor://…`); it points you to a personal access token instead.
[Why](#how-oauth-access-is-protected).

## Access levels (scopes)

| Access | Scopes | Can |
| --- | --- | --- |
| Read only | `network:read` | `search_people`, `get_person`, `list_notes`, `recent_interactions`, `search_notes`, `people_by_place`, `due_followups`, `list_taxonomy` |
| Read & write | `network:read network:write` | everything above, plus `add_note`, `create_person`, `update_person`, `create_followup`, `complete_followup` |

There are no delete tools. Write calls from a read-only connection fail with a message telling the
assistant to ask you to reconnect with Read & write. Every write is recorded in the audit log, and
each connection may make at most **60 changes per hour**. Notes and people an app creates are
marked with where they came from (`source_kind = mcp`, `source_ref = <token or app name>`).

## claude.ai (web, desktop and mobile)

1. Settings → Connectors → **Add custom connector**.
2. Name: `The Network`; URL: your server URL.
3. **Connect** → sign in to The Network (password + passkey) → choose **Read only** or
   **Read & write** → **Allow**.
4. In a chat, turn the connector on from the tools menu and ask, e.g. *“What did I last discuss
   with Ana?”*

Connectors you add on claude.ai are available in the Claude desktop and mobile apps too. If an app
you approved before asks to connect again, The Network shows **Reconnect claude.ai?** — press
**Continue** (only if you just asked it to reconnect).

## Claude Code

```bash
claude mcp add --transport http network https://<your-network>/api/mcp \
  --header "Authorization: Bearer ntk_…"
```

The New token dialog prints this command with your token filled in.

## Cursor

`~/.cursor/mcp.json` (or `.cursor/mcp.json` in a project):

```json
{
  "mcpServers": {
    "network": {
      "url": "https://<your-network>/api/mcp",
      "headers": { "Authorization": "Bearer ntk_…" }
    }
  }
}
```

## ChatGPT

Custom MCP connectors need developer mode: Settings → Apps & Connectors → Advanced → **Developer
mode**, then create a connector with your server URL and OAuth. Sign in and choose the access level
when asked. (Menu names change between ChatGPT releases; look for “connectors” and “developer mode”.)

## Grok and other clients

Any client that speaks MCP over Streamable HTTP works:

- **OAuth-capable clients** discover everything from the server URL (a `401` with a
  `WWW-Authenticate` header points to `/.well-known/oauth-protected-resource/api/mcp`).
- **Header-only clients** (for example the xAI API's remote MCP tool, or agent frameworks): pass the
  server URL and an `Authorization: Bearer ntk_…` header.
- **stdio-only clients**: bridge with [`mcp-remote`](https://www.npmjs.com/package/mcp-remote):
  `npx -y mcp-remote https://<your-network>/api/mcp --header "Authorization: Bearer ntk_…"`.

## Revoking access

Settings → Connected apps:

- **Revoke** a token — it stops working immediately.
- **Disconnect** an OAuth app — its access ends immediately (within 30 seconds on other server
  instances), and the next connection asks for consent again. Tokens it obtained before stay dead
  even if you approve the app again later.

## How OAuth access is protected

Supabase Auth issues the OAuth tokens, and it knows nothing about The Network's passkey: anyone
with your password could sign in to Supabase directly, start an authorization for an app you
already approved, read the authorization code from the API (no redirect needed) and — for apps
without a client secret — exchange it themselves. So `/api/mcp` doesn't stop at "valid token for
an approved app":

1. **Only after a passkey-verified approval.** Every Allow on the consent page, and every
   **Continue** on its *Reconnect* screen, is recorded in the audit log (the page needs password +
   passkey). Supabase stamps each token with the time its session was created (the
   `oauth_provider/authorization_code` entry of the `amr` claim, kept across refreshes); a token
   is honoured only if an approval for that app (or a Continue) happened within the 10 minutes
   before, and the app wasn't disconnected since. Tokens without that claim are refused.
2. **Only to public https hosts.** The consent page sends codes only to `https://` redirect URIs
   on public hosts, never to loopback, private-network or custom-scheme destinations — those are
   apps on a computer, usually without a client secret, and they connect with personal access
   tokens instead. While the app itself runs on `localhost`, loopback redirects are allowed for
   local testing.
3. **Nothing without a click.** An app approved before gets a *Reconnect* screen instead of an
   automatic redirect, so a link alone can't open the 10-minute window.
4. Scopes come from what you chose on the consent page, and disconnecting cuts an app off at once.

Residual risk: within 10 minutes after you approve or reconnect an app, someone who also has your
password and is watching could mint a token for an app you approved. Only the redirect URI of the
authorization at hand is checked — Supabase's user-facing API doesn't list a client's other
registered URIs (that needs the service-role admin API, which the app doesn't hold). Personal
access tokens are unaffected: they are created behind password + passkey and never go through
Supabase.

## Self-hosting: enabling OAuth

Tokens work out of the box. For OAuth (claude.ai, ChatGPT) the Supabase OAuth 2.1 server must be on:

1. Supabase Dashboard → **Authentication → OAuth Server**: enable it, set the **authorization
   path** to `/oauth/consent`, and the **Site URL** (Authentication → URL Configuration) to your
   app's public URL.
2. Let MCP clients register themselves: enable **dynamic client registration** (claude.ai and
   ChatGPT use it). Alternatively create an OAuth app by hand (redirect URI from the client, e.g.
   `https://claude.ai/api/mcp/auth_callback`) and paste its client ID/secret into the client's
   advanced connector settings.
3. Use asymmetric JWT signing keys (Authentication → JWT Keys), so access tokens are verified
   locally without a round trip to Supabase.
4. Set `NEXT_PUBLIC_APP_URL` to the public `https://` URL (it is the OAuth resource identifier).

The server publishes `/.well-known/oauth-protected-resource` (RFC 9728) pointing at
`<SUPABASE_URL>/auth/v1`, and mirrors Supabase's authorization-server metadata at
`/.well-known/oauth-authorization-server` for older clients.

## Testing locally

Tokens work against `pnpm dev` as is. The local Supabase (`supabase/config.toml`) also runs the OAuth
server with dynamic client registration and `/oauth/consent` as the authorization path, so the OAuth
flow can be tried with a local MCP client such as the MCP Inspector (`npx @modelcontextprotocol/inspector`);
loopback redirect URIs are accepted only because the app itself runs on `localhost`.
Hosted clients like claude.ai can't reach `localhost`.

```bash
# create a token while signed in (or use Settings → Connected apps)
curl -s -X POST http://localhost:3100/api/tokens -H 'content-type: application/json' \
  -H "cookie: <your session cookies>" -d '{"name":"local test","access":"read"}'

# list tools
curl -s http://localhost:3100/api/mcp -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' -H "Authorization: Bearer ntk_…" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```
