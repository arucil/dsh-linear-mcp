#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createLinearService } from "./linear.js";
import { buildServer, SERVER_NAME, SERVER_VERSION } from "./server.js";

interface CliArgs {
  apiKey?: string;
  endpoint?: string;
  timeoutMs?: number;
  help: boolean;
  version: boolean;
}

const USAGE = `dsh-linear-mcp ${SERVER_VERSION} — Linear MCP server (stdio)

Usage:
  dsh-linear-mcp [--api-key <lin_api_...>] [--endpoint <url>] [--timeout-ms <n>]

Auth:
  LINEAR_API_KEY   Linear personal API key (required) — used when --api-key is absent.
  LINEAR_API_URL   Optional GraphQL endpoint override.
  LINEAR_MCP_TIMEOUT_MS  Optional per-request timeout (default 20000).`;

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { help: false, version: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case "--api-key":
        args.apiKey = argv[++i];
        break;
      case "--endpoint":
        args.endpoint = argv[++i];
        break;
      case "--timeout-ms":
        args.timeoutMs = Number(argv[++i]);
        break;
      case "-h":
      case "--help":
        args.help = true;
        break;
      case "-v":
      case "--version":
        args.version = true;
        break;
      default:
        if (arg.startsWith("--api-key=")) args.apiKey = arg.slice("--api-key=".length);
        else if (arg.startsWith("--endpoint=")) args.endpoint = arg.slice("--endpoint=".length);
        else if (arg.startsWith("--timeout-ms=")) args.timeoutMs = Number(arg.slice("--timeout-ms=".length));
        break;
    }
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));

if (args.help) {
  process.stdout.write(`${USAGE}\n`);
  process.exit(0);
}
if (args.version) {
  process.stdout.write(`${SERVER_VERSION}\n`);
  process.exit(0);
}

const apiKey = args.apiKey ?? process.env.LINEAR_API_KEY;
if (!apiKey) {
  process.stderr.write(
    `${SERVER_NAME}: missing Linear API key. Pass --api-key <lin_api_...> or set LINEAR_API_KEY.\n`,
  );
  process.exit(2);
}

const envTimeout = process.env.LINEAR_MCP_TIMEOUT_MS ? Number(process.env.LINEAR_MCP_TIMEOUT_MS) : undefined;
const timeoutMs = args.timeoutMs ?? envTimeout;

const service = createLinearService({
  apiKey,
  ...(args.endpoint ?? process.env.LINEAR_API_URL
    ? { endpoint: args.endpoint ?? process.env.LINEAR_API_URL }
    : {}),
  ...(timeoutMs && Number.isFinite(timeoutMs) ? { timeoutMs } : {}),
});

const server = buildServer(service);
const transport = new StdioServerTransport();

server.connect(transport).catch((error: unknown) => {
  process.stderr.write(`${SERVER_NAME}: failed to start: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
