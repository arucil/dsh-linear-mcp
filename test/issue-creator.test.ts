import { createServer } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { createLinearService } from "../dist/linear.js";

const creator = {
  id: "creator-1",
  name: "QA Reporter",
  displayName: "reporter",
  email: "reporter@example.test",
};
const assignee = {
  id: "assignee-1",
  name: "Developer",
  displayName: "developer",
  email: "developer@example.test",
};
const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  while (cleanups.length > 0) await cleanups.pop()?.();
});

async function fixture(options: { creatorId?: string; creatorError?: boolean } = {}) {
  const userRequests: unknown[] = [];
  const issue = {
    id: "issue-1",
    identifier: "ENG-1",
    title: "QA handoff",
    priority: 2,
    state: { id: "state-1" },
    team: { id: "team-1" },
    creator: options.creatorId ? { id: options.creatorId } : null,
    assignee: { id: assignee.id },
    sharedAccess: { sharedWithUsers: [] },
    reactions: [],
  };
  const connection = { nodes: [], pageInfo: { hasNextPage: false, hasPreviousPage: false } };
  const server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      const body: unknown = JSON.parse(Buffer.concat(chunks).toString());
      if (typeof body !== "object" || body === null || !("query" in body) || typeof body.query !== "string") {
        response.writeHead(400).end("Invalid GraphQL request");
        return;
      }
      const operation = body.query.match(/\bquery\s+(\w+)/)?.[1];
      let data: Record<string, unknown>;
      if (operation === "user") {
        const variables = "variables" in body ? body.variables : null;
        const id = typeof variables === "object" && variables !== null && "id" in variables ? variables.id : null;
        userRequests.push(id);
        if (id === creator.id && options.creatorError) {
          response.setHeader("content-type", "application/json");
          response.end(JSON.stringify({ errors: [{ message: "creator access denied", extensions: { code: "FORBIDDEN" } }] }));
          return;
        }
        data = { user: id === creator.id ? creator : assignee };
      } else if (operation === "workflowState") {
        data = { workflowState: { id: "state-1", name: "In Progress", type: "started", team: { id: "team-1" } } };
      } else if (operation === "issue_children") {
        data = { issue: { children: connection } };
      } else if (operation === "issue_labels") {
        data = { issue: { labels: connection } };
      } else if (operation === "issue_relations") {
        data = { issue: { relations: connection } };
      } else if (operation === "issues") {
        data = { issues: { ...connection, nodes: [issue] } };
      } else if (operation === "issue") {
        data = { issue };
      } else {
        response.writeHead(400).end(`Unexpected fixture operation: ${operation}`);
        return;
      }
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ data }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  cleanups.push(() => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("Expected a TCP listener");
  return {
    service: createLinearService({ apiKey: "test-only", endpoint: `http://127.0.0.1:${address.port}`, timeoutMs: 2000 }),
    userRequests,
  };
}

describe("issue creator identity", () => {
  it("returns the real reporter separately from the assignee", async () => {
    const { service, userRequests } = await fixture({ creatorId: creator.id });
    const result = await service.getIssue({ id: "ENG-1" });
    expect(result).toMatchObject({ creator, creatorId: creator.id, assignee });
    expect(userRequests).toContain(creator.id);
  });

  it("includes creator identity in issue lists and exact-identifier search", async () => {
    const { service } = await fixture({ creatorId: creator.id });
    for (const result of [await service.listIssues({}), await service.searchIssues({ query: "ENG-1" })]) {
      expect(result).toMatchObject({ items: [{ creator, creatorId: creator.id, assignee }] });
    }
  });

  it("returns explicit nulls when Linear has no creator instead of guessing the assignee", async () => {
    const { service, userRequests } = await fixture();
    expect(await service.getIssue({ id: "ENG-1" })).toMatchObject({ creator: null, creatorId: null, assignee });
    expect(userRequests).toEqual([assignee.id]);
  });

  it("surfaces creator lookup failure instead of inventing a reporter", async () => {
    const { service } = await fixture({ creatorId: creator.id, creatorError: true });
    await expect(service.getIssue({ id: "ENG-1" })).rejects.toThrow("creator access denied");
  });
});
