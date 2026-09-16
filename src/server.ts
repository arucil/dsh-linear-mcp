import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { LinearService } from "./linear.js";

export const SERVER_NAME = "linear";
export const SERVER_VERSION = "0.1.0";

const relationType = z.enum(["blocks", "duplicate", "related", "similar"]);
const priority = z.number().int().min(0).max(4).describe("0 none, 1 urgent, 2 high, 3 medium, 4 low");
const limit = (max: number, def: number) => z.number().int().min(1).max(max).default(def);

async function json(value: unknown): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }] };
}

function fail(error: unknown): { isError: true; content: Array<{ type: "text"; text: string }> } {
  const message = error instanceof Error ? error.message : String(error);
  return { isError: true, content: [{ type: "text", text: message }] };
}

/**
 * Register every Linear tool on a fresh MCP server. Exported separately from
 * the stdio entry point so tests can drive it with an in-memory transport and
 * a fake LinearService.
 */
export function buildServer(linear: LinearService): McpServer {
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });

  server.registerTool(
    "linear_get_viewer",
    {
      title: "Get current Linear user",
      description: "Return the Linear user that owns the configured API key.",
      annotations: { readOnlyHint: true },
      inputSchema: {},
    },
    async () => {
      try {
        return await json(await linear.viewer());
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.registerTool(
    "linear_list_teams",
    {
      title: "List Linear teams",
      description: "List teams visible to the API key.",
      annotations: { readOnlyHint: true },
      inputSchema: { limit: limit(100, 50) },
    },
    async ({ limit: take }) => {
      try {
        return await json(await linear.listTeams({ limit: take }));
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.registerTool(
    "linear_list_users",
    {
      title: "List Linear users",
      description: "List users, optionally filtered by name, display name or email.",
      annotations: { readOnlyHint: true },
      inputSchema: { query: z.string().optional(), limit: limit(100, 50) },
    },
    async ({ query, limit: take }) => {
      try {
        return await json(await linear.listUsers({ query, limit: take }));
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.registerTool(
    "linear_list_projects",
    {
      title: "List Linear projects",
      description: "List projects, optionally scoped to one team.",
      annotations: { readOnlyHint: true },
      inputSchema: { teamId: z.string().optional(), limit: limit(100, 50) },
    },
    async ({ teamId, limit: take }) => {
      try {
        return await json(await linear.listProjects({ teamId, limit: take }));
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.registerTool(
    "linear_list_cycles",
    {
      title: "List Linear cycles",
      description: "List cycles, optionally scoped to one team.",
      annotations: { readOnlyHint: true },
      inputSchema: { teamId: z.string().optional(), limit: limit(100, 50) },
    },
    async ({ teamId, limit: take }) => {
      try {
        return await json(await linear.listCycles({ teamId, limit: take }));
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.registerTool(
    "linear_list_labels",
    {
      title: "List Linear issue labels",
      description: "List issue labels, optionally scoped to one team.",
      annotations: { readOnlyHint: true },
      inputSchema: { teamId: z.string().optional(), limit: limit(250, 100) },
    },
    async ({ teamId, limit: take }) => {
      try {
        return await json(await linear.listLabels({ teamId, limit: take }));
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.registerTool(
    "linear_list_workflow_states",
    {
      title: "List Linear workflow states",
      description: "List workflow states (backlog, unstarted, started, completed, canceled) for a team.",
      annotations: { readOnlyHint: true },
      inputSchema: { teamId: z.string().optional(), limit: limit(100, 100) },
    },
    async ({ teamId, limit: take }) => {
      try {
        return await json(await linear.listWorkflowStates({ teamId, limit: take }));
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.registerTool(
    "linear_search_issues",
    {
      title: "Search Linear issues",
      description:
        "Search issues by title, description or identifier (e.g. ENG-4651). Supports optional team, assignee, state, project and label filters.",
      annotations: { readOnlyHint: true },
      inputSchema: {
        query: z.string().describe("Search text or exact issue identifier"),
        teamId: z.string().optional().describe("Team UUID or key (e.g. ENG)"),
        assigneeId: z.string().optional().describe("Assignee UUID, or 'me'"),
        stateId: z.string().optional(),
        projectId: z.string().optional(),
        labelId: z.string().optional(),
        includeArchived: z.boolean().default(false),
        limit: limit(100, 20),
      },
    },
    async ({ query, teamId, assigneeId, stateId, projectId, labelId, includeArchived, limit: take }) => {
      try {
        const assignee = assigneeId === "me" ? "me" : assigneeId;
        return await json(
          await linear.searchIssues({
            query,
            teamId,
            assigneeId: assignee,
            stateId,
            projectId,
            labelId,
            includeArchived,
            limit: take,
          }),
        );
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.registerTool(
    "linear_list_issues",
    {
      title: "List Linear issues",
      description:
        "List issues with optional team / project / cycle / assignee / state / label filters. Pass assigneeId='me' for the current user; pass state for an exact state name such as 'In Review', or stateType for backlog|unstarted|started|completed|canceled.",
      annotations: { readOnlyHint: true },
      inputSchema: {
        teamId: z.string().optional().describe("Team UUID or key"),
        projectId: z.string().optional(),
        cycleId: z.string().optional(),
        assigneeId: z.string().optional().describe("Assignee UUID, or 'me'"),
        stateId: z.string().optional(),
        state: z.string().optional().describe("Exact workflow state name, e.g. 'In Review'"),
        stateType: z.enum(["backlog", "unstarted", "started", "completed", "canceled"]).optional(),
        labelId: z.string().optional(),
        includeArchived: z.boolean().default(false),
        limit: limit(100, 20),
      },
    },
    async (input) => {
      try {
        return await json(await linear.listIssues(input));
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.registerTool(
    "linear_list_my_issues",
    {
      title: "List my Linear issues",
      description: "List issues assigned to the API key's own Linear user.",
      annotations: { readOnlyHint: true },
      inputSchema: {
        teamId: z.string().optional(),
        includeArchived: z.boolean().default(false),
        limit: limit(100, 25),
      },
    },
    async (input) => {
      try {
        return await json(await linear.listMyIssues(input));
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.registerTool(
    "linear_get_issue",
    {
      title: "Get a Linear issue",
      description:
        "Return one issue by UUID or identifier (e.g. ENG-4651), including state, assignee, parent, children, labels and relations.",
      annotations: { readOnlyHint: true },
      inputSchema: { id: z.string().describe("Issue UUID or identifier") },
    },
    async ({ id }) => {
      try {
        return await json(await linear.getIssue({ id }));
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.registerTool(
    "linear_create_issue",
    {
      title: "Create a Linear issue",
      description:
        "Create an issue. Supports parentId to create a sub-issue, plus assignee, state, project, cycle, labels, priority, due date and estimate.",
      inputSchema: {
        teamId: z.string().describe("Team UUID or key"),
        title: z.string(),
        description: z.string().optional(),
        parentId: z.string().optional().describe("Parent issue UUID or identifier for a sub-issue"),
        assigneeId: z.string().optional().describe("Assignee UUID, or 'me'"),
        priority: priority.optional(),
        stateId: z.string().optional().describe("Workflow state UUID, or a state name if teamId is resolvable"),
        projectId: z.string().optional(),
        cycleId: z.string().optional(),
        labelIds: z.array(z.string()).optional(),
        dueDate: z.string().optional().describe("YYYY-MM-DD"),
        estimate: z.number().int().nonnegative().optional(),
      },
    },
    async (input) => {
      try {
        return await json(await linear.createIssue(input));
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.registerTool(
    "linear_update_issue",
    {
      title: "Update a Linear issue",
      description:
        "Update any mutable issue field, including parentId (move/reparent), state, assignee, labels, priority, project, cycle, due date and estimate.",
      inputSchema: {
        id: z.string().describe("Issue UUID or identifier"),
        title: z.string().optional(),
        description: z.string().optional(),
        parentId: z.string().optional(),
        assigneeId: z.string().optional().describe("Assignee UUID, or 'me'"),
        priority: priority.optional(),
        stateId: z.string().optional().describe("Workflow state UUID, or a state name if the issue's team resolves"),
        projectId: z.string().optional(),
        cycleId: z.string().optional(),
        labelIds: z.array(z.string()).optional(),
        dueDate: z.string().optional(),
        estimate: z.number().int().nonnegative().optional(),
      },
    },
    async (input) => {
      try {
        return await json(await linear.updateIssue(input));
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.registerTool(
    "linear_archive_issue",
    {
      title: "Archive a Linear issue",
      description: "Archive an issue (reversible in Linear).",
      annotations: { destructiveHint: true, idempotentHint: true },
      inputSchema: { id: z.string() },
    },
    async ({ id }) => {
      try {
        return await json(await linear.archiveIssue({ id }));
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.registerTool(
    "linear_delete_issue",
    {
      title: "Delete a Linear issue",
      description: "Permanently delete an issue.",
      annotations: { destructiveHint: true },
      inputSchema: { id: z.string() },
    },
    async ({ id }) => {
      try {
        return await json(await linear.deleteIssue({ id }));
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.registerTool(
    "linear_create_issue_relation",
    {
      title: "Create a Linear issue relation",
      description: "Create a relation such as blocks, related, duplicate or subtask between two issues.",
      inputSchema: {
        issueId: z.string(),
        relatedIssueId: z.string(),
        type: relationType,
      },
    },
    async (input) => {
      try {
        return await json(await linear.createIssueRelation(input));
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.registerTool(
    "linear_list_issue_relations",
    {
      title: "List Linear issue relations",
      description: "List relations for one issue.",
      annotations: { readOnlyHint: true },
      inputSchema: { issueId: z.string(), limit: limit(100, 50) },
    },
    async (input) => {
      try {
        return await json(await linear.listIssueRelations(input));
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.registerTool(
    "linear_delete_issue_relation",
    {
      title: "Delete a Linear issue relation",
      description: "Delete a relation by its relation UUID.",
      annotations: { destructiveHint: true },
      inputSchema: { id: z.string() },
    },
    async ({ id }) => {
      try {
        return await json(await linear.deleteIssueRelation({ id }));
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.registerTool(
    "linear_add_comment",
    {
      title: "Add a Linear comment",
      description: "Add a comment to an issue, optionally as a threaded reply.",
      inputSchema: {
        issueId: z.string(),
        body: z.string(),
        parentId: z.string().optional().describe("Parent comment UUID for a threaded reply"),
      },
    },
    async (input) => {
      try {
        return await json(await linear.addComment(input));
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.registerTool(
    "linear_list_comments",
    {
      title: "List Linear comments",
      description: "List comments on an issue.",
      annotations: { readOnlyHint: true },
      inputSchema: { issueId: z.string(), limit: limit(100, 50) },
    },
    async (input) => {
      try {
        return await json(await linear.listComments(input));
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.registerTool(
    "linear_update_comment",
    {
      title: "Update a Linear comment",
      description: "Update a comment body by its UUID.",
      inputSchema: { id: z.string(), body: z.string() },
    },
    async (input) => {
      try {
        return await json(await linear.updateComment(input));
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.registerTool(
    "linear_delete_comment",
    {
      title: "Delete a Linear comment",
      description: "Delete a comment by its UUID.",
      annotations: { destructiveHint: true },
      inputSchema: { id: z.string() },
    },
    async ({ id }) => {
      try {
        return await json(await linear.deleteComment({ id }));
      } catch (error) {
        return fail(error);
      }
    },
  );

  return server;
}
