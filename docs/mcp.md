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

## Production checklist

Written for `https://jakob-network.vercel.app`; substitute your own URL when self-hosting. Steps 1–3
are only needed for OAuth apps (claude.ai, ChatGPT); personal access tokens (step 5) work as soon as
the app is deployed.

**1. The deployment is ready.** Both of these should hold (no Supabase changes needed yet):

```bash
curl -s https://jakob-network.vercel.app/.well-known/oauth-protected-resource/api/mcp
```

- [ ] `"resource"` is `https://jakob-network.vercel.app/api/mcp` and `"authorization_servers"` is
      `["https://<project-ref>.supabase.co/auth/v1"]`. If `resource` shows another host, set
      `NEXT_PUBLIC_APP_URL=https://jakob-network.vercel.app` in Vercel (Production) and redeploy.
- [ ] There is **no** `scopes_supported` field. Older builds listed `network:read network:write`
      there; clients copy that into the sign-in request and Supabase rejects it with
      `unsupported scope: network:read`.

**2. Supabase Dashboard → your project → Authentication**

- [ ] **URL Configuration:** Site URL is `https://jakob-network.vercel.app` (Supabase builds the
      consent URL from it), and Redirect URLs include `https://jakob-network.vercel.app/auth/callback`.
- [ ] **JWT Keys:** the *current* signing key is asymmetric (ECC P-256 or RSA), not *Legacy HS256
      (shared secret)*. If it is legacy: create a standby ECC key, then **Rotate keys**. Sessions
      signed with the old secret stay valid until you revoke it. This is required: Supabase can't
      sign the ID token for a client that asks for `openid` with HS256, so its token exchange would
      fail. It also lets `/api/mcp` verify tokens without a round trip to Supabase.
- [ ] **OAuth Server:** turn the OAuth 2.1 server **on**, set **Authorization Path** to
      `/oauth/consent`, turn on **Allow Dynamic OAuth Apps** (dynamic client registration: claude.ai
      and ChatGPT register themselves), and save.
- [ ] Check: this command prints a URL ending in `/auth/v1/oauth/clients/register`. A `502` with
      `"unavailable"` means the OAuth server is still off.

  ```bash
  curl -s https://jakob-network.vercel.app/.well-known/oauth-authorization-server | grep -o '"registration_endpoint":"[^"]*"'
  ```

**3. claude.ai custom connector** (also appears in the Claude desktop and mobile apps)

- [ ] claude.ai → Settings → Connectors → **Add custom connector**. Name `The Network`, URL
      `https://jakob-network.vercel.app/api/mcp`. Leave the advanced OAuth client ID/secret empty.
- [ ] **Connect** → The Network opens → sign in (password + Face ID) → *Claude wants to connect to
      your network* → **Read only** (or **Read & write**) → **Allow** → you land back on claude.ai,
      connected.
- [ ] In a chat, enable The Network in the tools menu and ask *“What did I last discuss with Ana?”*
- [ ] The Network → Settings → Connected apps lists it under *Apps signed in with your account*.

If something goes wrong:

| You see | Meaning |
| --- | --- |
| `unsupported scope: network:read` | Step 1 isn't true yet (or claude.ai cached the old metadata, for up to an hour). |
| claude.ai: *authorization server metadata* / registration errors | Step 2's OAuth server or dynamic registration toggle is off. |
| *Request expired* on The Network | Supabase authorizations last a few minutes: press Connect again. |
| *Reconnect claude.ai?* | You approved it before. Press **Continue** only if you just pressed Connect. |
| Connected, but every tool call fails with 401 | Vercel logs: `[mcp] refused an OAuth session without a passkey-verified approval` means the token was minted more than 10 minutes after the approval, or the app was disconnected since. Disconnect it on claude.ai and connect again. |

**4. ChatGPT** (optional): Settings → Apps & Connectors → Advanced → **Developer mode**, then add a
connector with the same URL and OAuth; the consent page is the same as for claude.ai.

**5. Apps on your computer: personal access tokens.** One token per app and device, so each can be
revoked on its own.

- [ ] The Network → Settings → Connected apps → **New token** → name it (`Claude Code · MacBook`) →
      Read only or Read & write → **Create**. The token is shown **once**; the dialog prints the
      command below with it filled in.
- [ ] **Claude Code** (`--scope user` makes it available in every project):

  ```bash
  claude mcp add --transport http --scope user network https://jakob-network.vercel.app/api/mcp --header "Authorization: Bearer ntk_…"
  ```

  `claude mcp list` should show `network … ✓ Connected`; inside a session, `/mcp` lists its tools.
- [ ] **Cursor:** a second token, in `~/.cursor/mcp.json` ([below](#cursor)); Cursor Settings → MCP
      shows `network` with a green dot.
- [ ] **Anything else** (MCP Inspector, `mcp-remote`, agent frameworks): the same header. Smoke test:

  ```bash
  npx @modelcontextprotocol/inspector --cli --server-url https://jakob-network.vercel.app/api/mcp --header "Authorization: Bearer ntk_…" --method tools/list
  ```

Claude Code, Cursor and the Inspector can also do OAuth, but they receive the code on `localhost`,
which the consent page refuses in production — anyone with the password could pose as an app on
your computer. Tokens are created behind password + passkey instead.

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
claude mcp add --transport http --scope user network https://<your-network>/api/mcp \
  --header "Authorization: Bearer ntk_…"
```

The New token dialog prints this command with your token filled in. `--scope user` makes the server
available in every project; leave it out to add it to the current project only.

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
   `oauth_provider/authorization_code` entry of the `amr` claim: the code-exchange time in whole
   seconds, unchanged by refreshes — checked against Supabase Auth v2.196); a token is honoured only
   if an approval for that app (or a Continue) happened within the 10 minutes before, and the app
   wasn't disconnected since. Tokens without that claim are refused.
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

## Enabling OAuth

Tokens work out of the box. For OAuth (claude.ai, ChatGPT) the Supabase OAuth 2.1 server must be on —
steps 1–2 of the [production checklist](#production-checklist). Instead of dynamic registration you
can create an OAuth app by hand (Authentication → OAuth Apps; redirect URI from the client, e.g.
`https://claude.ai/api/mcp/auth_callback`) and paste its client ID/secret into the client's
advanced connector settings.

The server publishes `/.well-known/oauth-protected-resource` (RFC 9728) pointing at
`<SUPABASE_URL>/auth/v1`, and mirrors Supabase's authorization-server metadata at
`/.well-known/oauth-authorization-server` for older clients. It deliberately advertises no
`scopes_supported`: Supabase only issues its own scopes (`openid`, `email`, `profile`, `phone`,
`offline_access`) and refuses others, and the access level comes from the consent page anyway.

## Testing locally

Tokens work against `pnpm dev` as is. The local Supabase (`supabase/config.toml`) also runs the OAuth
server with dynamic client registration and `/oauth/consent` as the authorization path, so the whole
OAuth flow can be tried with the MCP Inspector; loopback redirect URIs are accepted only because the
app itself runs on `localhost`. Hosted clients like claude.ai can't reach `localhost`.

1. Check the OAuth server is on: `curl -s http://127.0.0.1:54321/auth/v1/.well-known/oauth-authorization-server`.
   `"OAuth server is disabled"` means the stack was started before `[auth.oauth_server]` existed:
   `supabase stop && supabase start` (data is kept).
2. In a terminal (the CLI needs a TTY to print the sign-in link), run
   `npx @modelcontextprotocol/inspector --cli --server-url http://localhost:3100/api/mcp --method tools/list`.
   It registers itself, prints a `…/auth/v1/oauth/authorize?…` link and waits on
   `http://127.0.0.1:6276/oauth/callback`.
3. Open the link in a browser signed in to `http://localhost:3100` (password, plus the passkey unless
   `AUTH_REQUIRE_PASSKEY=false`), choose the access level and Allow. The CLI prints the tools; later
   calls reuse the stored token (`--method tools/call --tool-name list_taxonomy`); `--relogin` starts over.

```bash
# create a token while signed in (or use Settings → Connected apps)
curl -s -X POST http://localhost:3100/api/tokens -H 'content-type: application/json' \
  -H "cookie: <your session cookies>" -d '{"name":"local test","access":"read"}'

# list tools
curl -s http://localhost:3100/api/mcp -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' -H "Authorization: Bearer ntk_…" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```
