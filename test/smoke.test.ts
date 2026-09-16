import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it } from "vitest";
import type { LinearService } from "../dist/linear.js";
import { buildServer } from "../dist/server.js";

function fakeLinear(overrides: Partial<LinearService> = {}): LinearService {
  const notImplemented = async () => {
    throw new Error("not implemented in test");
  };
  const base: LinearService = {
    viewer: notImplemented,
    listTeams: notImplemented,
    listUsers: notImplemented,
    listProjects: notImplemented,
    listCycles: notImplemented,
    listLabels: notImplemented,
    listWorkflowStates: notImplemented,
    searchIssues: notImplemented,
    listIssues: notImplemented,
    listMyIssues: notImplemented,
    getIssue: notImplemented,
    createIssue: notImplemented,
    updateIssue: notImplemented,
    archiveIssue: notImplemented,
    deleteIssue: notImplemented,
    createIssueRelation: notImplemented,
    listIssueRelations: notImplemented,
    deleteIssueRelation: notImplemented,
    addComment: notImplemented,
    listComments: notImplemented,
    updateComment: notImplemented,
    deleteComment: notImplemented,
  };
  return { ...base, ...overrides };
}

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  while (cleanups.length > 0) await cleanups.pop()?.();
});

async function connect(service: LinearService) {
  const server = buildServer(service);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "smoke", version: "0.0.0" });
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  cleanups.push(async () => {
    await client.close();
    await server.close();
  });
  return client;
}

const EXPECTED_TOOLS = [
  "linear_add_comment",
  "linear_archive_issue",
  "linear_create_issue",
  "linear_create_issue_relation",
  "linear_delete_comment",
  "linear_delete_issue",
  "linear_delete_issue_relation",
  "linear_get_issue",
  "linear_get_viewer",
  "linear_list_comments",
  "linear_list_cycles",
  "linear_list_issue_relations",
  "linear_list_issues",
  "linear_list_labels",
  "linear_list_my_issues",
  "linear_list_projects",
  "linear_list_teams",
  "linear_list_users",
  "linear_list_workflow_states",
  "linear_search_issues",
  "linear_update_comment",
  "linear_update_issue",
];

describe("dsh-linear-mcp server", () => {
  it("registers the complete Linear tool surface", async () => {
    const client = await connect(fakeLinear());
    const { tools } = await client.listTools();
    const names = tools.map((tool) => tool.name).sort();
    expect(names).toEqual(EXPECTED_TOOLS);
  });

  it("exposes sub-issue and assignee capabilities in the schemas", async () => {
    const client = await connect(fakeLinear());
    const { tools } = await client.listTools();
    const byName = new Map(tools.map((tool) => [tool.name, tool]));
    const createSchema = JSON.stringify(byName.get("linear_create_issue")?.inputSchema ?? {});
    const listSchema = JSON.stringify(byName.get("linear_list_issues")?.inputSchema ?? {});
    expect(createSchema).toContain("parentId");
    expect(listSchema).toContain("assigneeId");
    expect(listSchema).toContain("state");
  });

  it("returns tool output as JSON text", async () => {
    const client = await connect(
      fakeLinear({
        listTeams: async () => ({ items: [{ id: "team-1", key: "ENG", name: "Engineering" }] }),
      }),
    );
    const result = await client.callTool({ name: "linear_list_teams", arguments: {} });
    const [first] = result.content as Array<{ type: string; text?: string }>;
    expect(first.type).toBe("text");
    expect(JSON.parse(first.text ?? "{}")).toEqual({
      items: [{ id: "team-1", key: "ENG", name: "Engineering" }],
    });
  });

  it("surfaces service errors as tool errors", async () => {
    const client = await connect(
      fakeLinear({
        listTeams: async () => {
          throw new Error("Linear request timed out after 20000ms");
        },
      }),
    );
    const result = await client.callTool({ name: "linear_list_teams", arguments: {} });
    const [first] = result.content as Array<{ type: string; text?: string }>;
    expect(result.isError).toBe(true);
    expect(first.text).toContain("timed out");
  });
});
