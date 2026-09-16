import {
  IssueRelationType,
  LinearClient,
  type Comment,
  type Cycle,
  type Issue,
  type IssueLabel,
  type Project,
  type Team,
  type User,
  type WorkflowState,
} from "@linear/sdk";

type IssuesArgs = NonNullable<Parameters<LinearClient["issues"]>[0]>;
type IssueFilterInput = NonNullable<IssuesArgs["filter"]>;

export interface LinearServiceOptions {
  apiKey: string;
  /** Override the GraphQL endpoint (defaults to https://api.linear.app/graphql). */
  endpoint?: string;
  /** Per-request timeout in milliseconds. Default 20000. */
  timeoutMs?: number;
}

export interface LinearService {
  viewer(): Promise<unknown>;
  listTeams(input: { limit?: number }): Promise<unknown>;
  listUsers(input: { query?: string; limit?: number }): Promise<unknown>;
  listProjects(input: { teamId?: string; limit?: number }): Promise<unknown>;
  listCycles(input: { teamId?: string; limit?: number }): Promise<unknown>;
  listLabels(input: { teamId?: string; limit?: number }): Promise<unknown>;
  listWorkflowStates(input: { teamId?: string; limit?: number }): Promise<unknown>;
  searchIssues(input: {
    query: string;
    teamId?: string;
    assigneeId?: string;
    stateId?: string;
    projectId?: string;
    labelId?: string;
    includeArchived?: boolean;
    limit?: number;
  }): Promise<unknown>;
  listIssues(input: {
    teamId?: string;
    projectId?: string;
    cycleId?: string;
    assigneeId?: string;
    stateId?: string;
    state?: string;
    stateType?: string;
    labelId?: string;
    includeArchived?: boolean;
    limit?: number;
  }): Promise<unknown>;
  listMyIssues(input: { teamId?: string; includeArchived?: boolean; limit?: number }): Promise<unknown>;
  getIssue(input: { id: string }): Promise<unknown>;
  createIssue(input: {
    teamId: string;
    title: string;
    description?: string;
    parentId?: string;
    assigneeId?: string;
    priority?: number;
    stateId?: string;
    projectId?: string;
    cycleId?: string;
    labelIds?: string[];
    dueDate?: string;
    estimate?: number;
  }): Promise<unknown>;
  updateIssue(input: {
    id: string;
    title?: string;
    description?: string;
    parentId?: string;
    assigneeId?: string;
    priority?: number;
    stateId?: string;
    projectId?: string;
    cycleId?: string;
    labelIds?: string[];
    dueDate?: string;
    estimate?: number;
  }): Promise<unknown>;
  archiveIssue(input: { id: string }): Promise<unknown>;
  deleteIssue(input: { id: string }): Promise<unknown>;
  createIssueRelation(input: {
    issueId: string;
    relatedIssueId: string;
    type: string;
  }): Promise<unknown>;
  listIssueRelations(input: { issueId: string; limit?: number }): Promise<unknown>;
  deleteIssueRelation(input: { id: string }): Promise<unknown>;
  addComment(input: { issueId: string; body: string; parentId?: string }): Promise<unknown>;
  listComments(input: { issueId: string; limit?: number }): Promise<unknown>;
  updateComment(input: { id: string; body: string }): Promise<unknown>;
  deleteComment(input: { id: string }): Promise<unknown>;
}

const DEFAULT_TIMEOUT_MS = 20_000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Linear request timed out after ${ms}ms`)), ms);
    timer.unref?.();
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function toRelationType(type: string): IssueRelationType {
  const allowed: Record<string, IssueRelationType> = {
    blocks: IssueRelationType.Blocks,
    duplicate: IssueRelationType.Duplicate,
    related: IssueRelationType.Related,
    similar: IssueRelationType.Similar,
  };
  const found = allowed[type];
  if (!found) throw new Error(`Unsupported relation type "${type}". Expected one of: ${Object.keys(allowed).join(", ")}`);
  return found;
}

async function serializeIssue(issue: Issue): Promise<Record<string, unknown>> {
  const [state, assignee, project, cycle, parent, children, labels, relations] = await Promise.all([
    issue.state,
    issue.assignee,
    issue.project,
    issue.cycle,
    issue.parent,
    issue.children({ first: 50 }),
    issue.labels({ first: 50 }),
    issue.relations({ first: 50 }),
  ]);
  return {
    id: issue.id,
    identifier: issue.identifier,
    title: issue.title,
    description: issue.description ?? null,
    url: issue.url,
    priority: issue.priority,
    estimate: issue.estimate ?? null,
    dueDate: issue.dueDate ?? null,
    createdAt: issue.createdAt,
    updatedAt: issue.updatedAt,
    archivedAt: issue.archivedAt ?? null,
    state: state ? { id: state.id, name: state.name, type: state.type } : null,
    assignee: assignee
      ? { id: assignee.id, name: assignee.name, displayName: assignee.displayName, email: assignee.email }
      : null,
    project: project ? { id: project.id, name: project.name, state: project.state } : null,
    cycle: cycle ? { id: cycle.id, name: cycle.name, number: cycle.number } : null,
    parent: parent ? { id: parent.id, identifier: parent.identifier, title: parent.title } : null,
    children: children.nodes.map((child) => ({
      id: child.id,
      identifier: child.identifier,
      title: child.title,
    })),
    labels: labels.nodes.map((label) => ({ id: label.id, name: label.name, color: label.color })),
    relations: relations.nodes.map((relation) => ({
      id: relation.id,
      type: relation.type,
    })),
  };
}

export function createLinearService(options: LinearServiceOptions): LinearService {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const client = new LinearClient({
    apiKey: options.apiKey,
    ...(options.endpoint ? { apiUrl: options.endpoint } : {}),
  });
  const run = <T>(promise: Promise<T>): Promise<T> => withTimeout(promise, timeoutMs);

  async function resolveStateId(teamId: string | undefined, state: string): Promise<string | undefined> {
    if (!teamId) return undefined;
    const states = await run(
      client.workflowStates({ filter: { team: { id: { eq: teamId } }, name: { eqIgnoreCase: state } }, first: 1 }),
    );
    return states.nodes[0]?.id;
  }

  async function resolveViewerId(): Promise<string> {
    const viewer = await run(client.viewer);
    return viewer.id;
  }

  async function resolveTeamId(teamIdOrKey: string | undefined): Promise<string | undefined> {
    if (!teamIdOrKey) return undefined;
    if (/^[0-9a-f-]{36}$/i.test(teamIdOrKey)) return teamIdOrKey;
    const teams = await run(client.teams({ filter: { key: { eq: teamIdOrKey } }, first: 1 }));
    return teams.nodes[0]?.id;
  }

  return {
    async viewer() {
      const viewer = await run(client.viewer);
      return { id: viewer.id, name: viewer.name, displayName: viewer.displayName, email: viewer.email };
    },

    async listTeams({ limit = 50 }) {
      const teams = await run(client.teams({ first: Math.min(limit, 100) }));
      return {
        items: teams.nodes.map((team: Team) => ({ id: team.id, key: team.key, name: team.name })),
      };
    },

    async listUsers({ query, limit = 50 }) {
      const users = await run(
        client.users({
          first: Math.min(limit, 100),
          ...(query
            ? {
                filter: {
                  or: [
                    { name: { containsIgnoreCase: query } },
                    { displayName: { containsIgnoreCase: query } },
                    { email: { containsIgnoreCase: query } },
                  ],
                },
              }
            : {}),
        }),
      );
      return {
        items: users.nodes.map((user: User) => ({
          id: user.id,
          name: user.name,
          displayName: user.displayName,
          email: user.email,
          active: user.active,
        })),
      };
    },

    async listProjects({ teamId, limit = 50 }) {
      const resolvedTeam = await resolveTeamId(teamId);
      const projects = await run(
        client.projects({
          first: Math.min(limit, 100),
          ...(resolvedTeam ? { filter: { accessibleTeams: { some: { id: { eq: resolvedTeam } } } } } : {}),
        }),
      );
      return {
        items: projects.nodes.map((project: Project) => ({
          id: project.id,
          name: project.name,
          state: project.state,
          progress: project.progress,
          url: project.url,
        })),
      };
    },

    async listCycles({ teamId, limit = 50 }) {
      const resolvedTeam = await resolveTeamId(teamId);
      const cycles = await run(
        client.cycles({
          first: Math.min(limit, 100),
          ...(resolvedTeam ? { filter: { team: { id: { eq: resolvedTeam } } } } : {}),
        }),
      );
      return {
        items: cycles.nodes.map((cycle: Cycle) => ({
          id: cycle.id,
          name: cycle.name,
          number: cycle.number,
          startsAt: cycle.startsAt,
          endsAt: cycle.endsAt,
          progress: cycle.progress,
        })),
      };
    },

    async listLabels({ teamId, limit = 100 }) {
      const resolvedTeam = await resolveTeamId(teamId);
      const labels = await run(
        client.issueLabels({
          first: Math.min(limit, 250),
          ...(resolvedTeam ? { filter: { team: { id: { eq: resolvedTeam } } } } : {}),
        }),
      );
      return {
        items: labels.nodes.map((label: IssueLabel) => ({
          id: label.id,
          name: label.name,
          color: label.color,
          parentId: label.parentId ?? null,
        })),
      };
    },

    async listWorkflowStates({ teamId, limit = 100 }) {
      const resolvedTeam = await resolveTeamId(teamId);
      const states = await run(
        client.workflowStates({
          first: Math.min(limit, 100),
          ...(resolvedTeam ? { filter: { team: { id: { eq: resolvedTeam } } } } : {}),
        }),
      );
      return {
        items: states.nodes.map((state: WorkflowState) => ({
          id: state.id,
          name: state.name,
          type: state.type,
          color: state.color,
        })),
      };
    },

    async searchIssues({ query, teamId, assigneeId, stateId, projectId, labelId, includeArchived, limit = 20 }) {
      const resolvedTeam = await resolveTeamId(teamId);
      const trimmed = query.trim();
      if (/^[A-Za-z][A-Za-z0-9]*-\d+$/.test(trimmed)) {
        try {
          const direct = await run(client.issue(trimmed));
          return {
            items: [await serializeIssue(direct)],
            pageInfo: { hasNextPage: false, endCursor: null },
          };
        } catch {
          // Not resolvable as an identifier; fall back to text search.
        }
      }
      const filter: IssueFilterInput = {
        or: [
          { title: { containsIgnoreCase: query } },
          { description: { containsIgnoreCase: query } },
        ],
      };
      if (resolvedTeam) filter.team = { id: { eq: resolvedTeam } };
      if (assigneeId) filter.assignee = { id: { eq: assigneeId } };
      if (stateId) filter.state = { id: { eq: stateId } };
      if (projectId) filter.project = { id: { eq: projectId } };
      if (labelId) filter.labels = { some: { id: { eq: labelId } } };
      const issues = await run(
        client.issues({ first: Math.min(limit, 100), filter, includeArchived: includeArchived ?? false }),
      );
      return {
        items: await Promise.all(issues.nodes.map((issue: Issue) => serializeIssue(issue))),
        pageInfo: issues.pageInfo,
      };
    },

    async listIssues({ teamId, projectId, cycleId, assigneeId, stateId, state, stateType, labelId, includeArchived, limit = 20 }) {
      const resolvedTeam = await resolveTeamId(teamId);
      const resolvedAssignee = assigneeId === "me" ? await resolveViewerId() : assigneeId;
      const resolvedState = stateId ?? (state ? await resolveStateId(resolvedTeam, state) : undefined);
      const filter: IssueFilterInput = {};
      if (resolvedTeam) filter.team = { id: { eq: resolvedTeam } };
      if (resolvedAssignee) filter.assignee = { id: { eq: resolvedAssignee } };
      if (resolvedState) filter.state = { id: { eq: resolvedState } };
      if (stateType) filter.state = { type: { eq: stateType } };
      if (projectId) filter.project = { id: { eq: projectId } };
      if (cycleId) filter.cycle = { id: { eq: cycleId } };
      if (labelId) filter.labels = { some: { id: { eq: labelId } } };
      const issues = await run(
        client.issues({ first: Math.min(limit, 100), filter, includeArchived: includeArchived ?? false }),
      );
      return {
        items: await Promise.all(issues.nodes.map((issue: Issue) => serializeIssue(issue))),
        pageInfo: issues.pageInfo,
      };
    },

    async listMyIssues({ teamId, includeArchived, limit = 20 }) {
      const resolvedTeam = await resolveTeamId(teamId);
      const assigneeId = await resolveViewerId();
      const filter: IssueFilterInput = { assignee: { id: { eq: assigneeId } } };
      if (resolvedTeam) filter.team = { id: { eq: resolvedTeam } };
      const issues = await run(
        client.issues({ first: Math.min(limit, 100), filter, includeArchived: includeArchived ?? false }),
      );
      return {
        items: await Promise.all(issues.nodes.map((issue: Issue) => serializeIssue(issue))),
        pageInfo: issues.pageInfo,
      };
    },

    async getIssue({ id }) {
      const issue = await run(client.issue(id));
      return serializeIssue(issue);
    },

    async createIssue(input) {
      const payload = await run(
        client.createIssue({
          teamId: input.teamId,
          title: input.title,
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(input.parentId !== undefined ? { parentId: input.parentId } : {}),
          ...(input.assigneeId !== undefined ? { assigneeId: input.assigneeId } : {}),
          ...(input.priority !== undefined ? { priority: input.priority } : {}),
          ...(input.stateId !== undefined ? { stateId: input.stateId } : {}),
          ...(input.projectId !== undefined ? { projectId: input.projectId } : {}),
          ...(input.cycleId !== undefined ? { cycleId: input.cycleId } : {}),
          ...(input.labelIds !== undefined ? { labelIds: input.labelIds } : {}),
          ...(input.dueDate !== undefined ? { dueDate: input.dueDate } : {}),
          ...(input.estimate !== undefined ? { estimate: input.estimate } : {}),
        }),
      );
      const issue = await payload.issue;
      return { success: payload.success, issue: issue ? await serializeIssue(issue) : null };
    },

    async updateIssue(input) {
      const { id, ...rest } = input;
      const patch = Object.fromEntries(Object.entries(rest).filter(([, value]) => value !== undefined));
      const payload = await run(client.updateIssue(id, patch));
      const issue = await payload.issue;
      return { success: payload.success, issue: issue ? await serializeIssue(issue) : null };
    },

    async archiveIssue({ id }) {
      const payload = await run(client.archiveIssue(id));
      return { success: payload.success, entity: id };
    },

    async deleteIssue({ id }) {
      const payload = await run(client.deleteIssue(id));
      return { success: payload.success, entity: id };
    },

    async createIssueRelation({ issueId, relatedIssueId, type }) {
      const payload = await run(
        client.createIssueRelation({ issueId, relatedIssueId, type: toRelationType(type) }),
      );
      const relation = await payload.issueRelation;
      return {
        success: payload.success,
        relation: relation ? { id: relation.id, type: relation.type } : null,
      };
    },

    async listIssueRelations({ issueId, limit = 50 }) {
      const issue = await run(client.issue(issueId));
      const relations = await run(issue.relations({ first: Math.min(limit, 100) }));
      const items: Array<Record<string, unknown>> = [];
      for (const relation of relations.nodes) {
        const source = await relation.issue;
        const target = await relation.relatedIssue;
        if (!source || !target) continue;
        items.push({
          id: relation.id,
          type: relation.type,
          issue: { id: source.id, identifier: source.identifier, title: source.title },
          relatedIssue: { id: target.id, identifier: target.identifier, title: target.title },
        });
      }
      return { items };
    },

    async deleteIssueRelation({ id }) {
      const payload = await run(client.deleteIssueRelation(id));
      return { success: payload.success, entity: payload.entityId ?? id };
    },

    async addComment({ issueId, body, parentId }) {
      const payload = await run(
        client.createComment({ issueId, body, ...(parentId !== undefined ? { parentId } : {}) }),
      );
      const comment = await payload.comment;
      return { success: payload.success, comment: comment ? serializeComment(comment) : null };
    },

    async listComments({ issueId, limit = 50 }) {
      const comments = await run(
        client.comments({ first: Math.min(limit, 100), filter: { issue: { id: { eq: issueId } } } }),
      );
      return { items: await Promise.all(comments.nodes.map((comment: Comment) => serializeComment(comment))) };
    },

    async updateComment({ id, body }) {
      const payload = await run(client.updateComment(id, { body }));
      const comment = await payload.comment;
      return { success: payload.success, comment: comment ? serializeComment(comment) : null };
    },

    async deleteComment({ id }) {
      const payload = await run(client.deleteComment(id));
      return { success: payload.success, entity: payload.entityId ?? id };
    },
  };
}

async function serializeComment(comment: Comment): Promise<Record<string, unknown>> {
  const [user, parent] = await Promise.all([comment.user, comment.parent]);
  return {
    id: comment.id,
    body: comment.body,
    createdAt: comment.createdAt,
    updatedAt: comment.updatedAt,
    url: comment.url,
    user: user ? { id: user.id, name: user.name, displayName: user.displayName } : null,
    parentId: parent?.id ?? null,
  };
}
