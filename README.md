# dsh-linear-mcp

A **stdio Model Context Protocol server for Linear**, built for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (`dsh`), Codex, Claude and any other MCP client.

It authenticates with a **Linear personal API key** (`lin_api_…`) instead of OAuth, so it starts instantly and never needs a browser round-trip. That makes it a good fit for headless / ACP / Paseo-style agents where an OAuth-discovery bridge would race the session's tool snapshot.

- 22 tools: issues, **sub-issues**, **relations**, comments, projects, cycles, teams, users, labels, workflow states
- Plain JSON output, per-request timeout, no write tools without a key
- Zero runtime services: one Node process, stdio only

## Tools

| Tool | Purpose |
|---|---|
| `linear_get_viewer` | The Linear user that owns the API key |
| `linear_list_teams` / `linear_list_users` | Resolve team and user UUIDs (users support a name/email query) |
| `linear_list_projects` / `linear_list_cycles` / `linear_list_labels` / `linear_list_workflow_states` | Resolve project, cycle, label and state UUIDs |
| `linear_search_issues` | Free-text search; an exact identifier like `ENG-4651` is fetched directly |
| `linear_list_issues` | Filter by team, project, cycle, **assignee (`"me"` supported)**, exact state name, state type, label, archived |
| `linear_list_my_issues` | Issues assigned to the API key's own user |
| `linear_get_issue` | Full detail: state, assignee, parent, children, labels, relations |
| `linear_create_issue` | Create, including **`parentId` for a sub-issue** |
| `linear_update_issue` | Update any mutable field, including `parentId` (reparent) and archive |
| `linear_archive_issue` / `linear_delete_issue` | Archive (reversible) / delete |
| `linear_create_issue_relation` / `linear_list_issue_relations` / `linear_delete_issue_relation` | `blocks` / `duplicate` / `related` / `similar` relations |
| `linear_add_comment` / `linear_list_comments` | Read and write comments (threaded replies supported) |
| `linear_update_comment` / `linear_delete_comment` | Edit / delete comments |

## Auth

Create a key in Linear → **Settings → Account → Security & Access → Personal API keys**, then export it:

```bash
export LINEAR_API_KEY="lin_api_xxxxxxxx"
```

The server sends the key as `Authorization: <key>` (personal API keys; OAuth tokens starting with anything else are sent as `Bearer`). It never logs the key.

## Install

```bash
# from this repo (no npm publish required)
npm install --global github:arucil/dsh-linear-mcp

# or run without installing
npx --yes github:arucil/dsh-linear-mcp --help
```

## Use with DeepSeek Harness (`dsh`)

1. Install the server into the profile you use (`web`, `acp` for Paseo, `headless`):

   ```bash
   dsh plugin --profile acp add github:arucil/dsh-linear-mcp
   ```

   This links `dsh-linear-mcp` into `~/.dsh/profiles/acp/node_modules/.bin/`.

2. Mount it through the first-party MCP bridge by adding this to
   `~/.dsh/profiles/acp/cordis.patch.yml` (see [`examples/dsh-cordis.patch.yml`](examples/dsh-cordis.patch.yml)):

   ```yaml
   - insert:
       - id: mcp-linear
         name: '@deepseek-ai/dsh-mcp-client'
         config:
           serverName: linear
           transport: stdio
           command: /home/USER/.dsh/profiles/acp/node_modules/.bin/dsh-linear-mcp
           env:
             LINEAR_API_KEY: !!js process.env.LINEAR_API_KEY
           toolCallTimeoutMs: 60000
   ```

3. Start a **new** session (bundle patches apply at startup). The model sees the tools as `mcp__linear__<tool>`.

> Put `LINEAR_API_KEY` in the environment of the process that starts `dsh` (your shell, or the Paseo daemon). Do not commit it to the profile.

## Use with Codex

```toml
[mcp_servers.linear-local]
command = "dsh-linear-mcp"
args = []
env = { LINEAR_API_KEY = "lin_api_xxxxxxxx" }
```

## Use with Claude Code

```bash
claude mcp add linear -- dsh-linear-mcp
# then export LINEAR_API_KEY, or pass env in the client config
```

## CLI

```
dsh-linear-mcp [--api-key <lin_api_...>] [--endpoint <url>] [--timeout-ms <n>]

LINEAR_API_KEY          required unless --api-key is passed
LINEAR_API_URL          optional GraphQL endpoint override
LINEAR_MCP_TIMEOUT_MS   optional per-request timeout (default 20000)
```

## Development

```bash
npm install
npm run build      # tsc -> dist/
npm test           # builds, then runs the in-memory MCP smoke tests
npm run typecheck
```

The smoke tests drive the server over an in-memory MCP transport with a fake `LinearService`, so they need no network or API key.

## Security

- Read/write over your own Linear permissions. Delete tools are marked destructive for clients that honor annotations.
- The API key stays in the process environment; the server never writes it to disk or logs it.
- Only `https://api.linear.app/graphql` is contacted unless you override `LINEAR_API_URL`.

## License

MIT
