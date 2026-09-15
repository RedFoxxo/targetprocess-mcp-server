import { readFileSync } from "fs";
import { basename } from "path";
import { config } from "./config.js";
import {
  TpClientParameters,
  TpResponse,
  TpResult,
  Relation,
  BugInputSchema,
  Bug,
  Task,
  LoggedUser,
  RoleAssignment,
  RoleEffort,
  WorkflowEntityState,
  TestPlan,
  TestCase
} from "./types.js";

type TestPlanNode = {
  id: string
  numericId: number
  name?: string
}

export class TpClient {

  private baseUrl: string = config.tp.url
  private token: string = config.tp.token
  private headers: HeadersInit
  private readonly v1 = '/api/v1'
  private readonly v2 = '/api/v2'

  constructor() {
    this.headers = {
      "Content-Type": "application/json",
      Accept: "application/json",
    }
  }

  private params(params: TpClientParameters): string {
    let _url = this.baseUrl + (params.apiVersion || this.v1)
    for (const segment of params.pathParam) {
      _url += `/${segment}`
    }

    let _urlParams = []
    for (const [key, value] of Object.entries(params.param)) {
      _urlParams.push(`${key}=${encodeURIComponent(value)}`)
    }
    return _url + "/?" + _urlParams.join("&")
  }

  // Strips the access_token value out of a URL before it's logged, so the
  // live TP credential never ends up in stderr/log files. Matches on the
  // parameter name, not the token value: params() percent-encodes the token.
  private redact(url: string): string {
    return url.replace(/([?&]access_token=)[^&]*/gi, "$1***")
  }

  // @ts-ignore
  private async getAll<T>(params: TpClientParameters): Promise<T[]> {
    const allItems: T[] = []
    let skip = 0
    const take = 100

    while (true) {
      params.param["take"] = take
      params.param["skip"] = skip
      const page = await this.get<TpResponse<T>>(params)
      if (!page?.Items?.length) break
      allItems.push(...page.Items)
      if (!page.Next) break
      skip += take
    }

    return allItems
  }

  private async get<T>(params: TpClientParameters): Promise<T | null> {
    params.param["access_token"] = this.token
    let _url = this.params(params)
    console.error(JSON.stringify({ "TP_GET_URL": this.redact(_url) }))
    try {
      const response = await fetch(_url, {
        method: "GET",
        headers: this.headers
      });
      if (!response.ok) {
        const body = typeof response.text === "function" ? await response.text() : ""
        throw new Error(`HTTP error! status: ${response.status}${body ? `; body: ${body}` : ""}`);
      }

      return (await response.json()) as T
    } catch (error: any) {
      console.error("Error making TP request:", error);
      console.error("Request URL:", this.redact(_url));
      return error
    }
  }

  private async post<T, U>(params: TpClientParameters, data: T): Promise<U | null> {
    params.param["access_token"] = this.token
    let _url = this.params(params)
    console.error(JSON.stringify({ "TP_POST_URL": this.redact(_url) }))
    console.error(JSON.stringify({ "TP_POST_BODY": data }))
    try {
      const response = await fetch(_url, {
        method: "POST",
        headers: this.headers,
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return (await response.json()) as U
    } catch (error: any) {
      console.error("Error making TP request:", error);
      return error
    }
  }

  // Like post(), but on failure returns the HTTP status and raw response body
  // instead of null, so callers can surface TP's error detail to the user.
  private async postRaw<T, U>(params: TpClientParameters, data: T): Promise<TpResult<U>> {
    params.param["access_token"] = this.token
    let _url = this.params(params)
    console.error(JSON.stringify({ "TP_POST_URL": this.redact(_url) }))
    console.error(JSON.stringify({ "TP_POST_BODY": data }))
    try {
      const response = await fetch(_url, {
        method: "POST",
        headers: this.headers,
        body: JSON.stringify(data),
      });
      const text = await response.text()
      if (!response.ok) {
        console.error(JSON.stringify({ "TP_POST_ERROR_STATUS": response.status, "TP_POST_ERROR_BODY": text }))
        return { ok: false, status: response.status, body: text }
      }
      return { ok: true, data: (text ? JSON.parse(text) : null) as U }
    } catch (error) {
      console.error("Error making TP request:", error);
      return { ok: false, status: 0, body: String(error) }
    }
  }

  // DELETE request that, like postRaw(), surfaces the HTTP status and raw
  // response body on failure so callers can report TP's error detail.
  private async del<U>(params: TpClientParameters): Promise<TpResult<U>> {
    params.param["access_token"] = this.token
    let _url = this.params(params)
    console.error(JSON.stringify({ "TP_DELETE_URL": this.redact(_url) }))
    try {
      const response = await fetch(_url, {
        method: "DELETE",
        headers: this.headers,
      });
      const text = await response.text()
      if (!response.ok) {
        console.error(JSON.stringify({ "TP_DELETE_ERROR_STATUS": response.status, "TP_DELETE_ERROR_BODY": text }))
        return { ok: false, status: response.status, body: text }
      }
      return { ok: true, data: (text ? JSON.parse(text) : null) as U }
    } catch (error) {
      console.error("Error making TP request:", error);
      return { ok: false, status: 0, body: String(error) }
    }
  }

  private async getAllOrNull<T>(params: TpClientParameters): Promise<T[] | null> {
    const allItems: T[] = []
    let skip = 0
    const take = 100

    while (true) {
      const page = await this.get<TpResponse<T>>({
        ...params,
        param: {
          ...params.param,
          take,
          skip,
        },
      })
      if (page instanceof Error) return null
      if (!page?.Items?.length) break
      allItems.push(...page.Items)
      if (!page.Next) break
      skip += take
    }

    return allItems
  }

  /**
   * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
   * TP
   * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
   */
  async getUserStory<T>(userStoryId: string): Promise<T> {
    const response = await this.get<T>({
      pathParam: ["userStories", userStoryId],
      param: { "format": "json" },
    }) as T

    return response
  }

  async getBug<T>(bugId: string): Promise<T> {
    const response = await this.get<T>({
      pathParam: ["bugs", bugId],
      param: { "format": "json" }
    }) as T

    return response
  }

  async getFeature<T>(featureId: string): Promise<T> {
    const response = await this.get<T>({
      pathParam: ["features", featureId],
      param: { "format": "json" }
    }) as T

    return response
  }

  // Works for any card type, so a bug can inherit the project of the user
  // story, bug, or feature it was raised from.
  private async getAssignableProjectId(cardId: string): Promise<number | null> {
    const card = await this.get<{ Project?: { Id?: number } }>({
      pathParam: ["Assignables", cardId],
      param: { "format": "json", "include": "[Id,Project[Id]]" },
    })
    if (card instanceof Error) return null
    return card?.Project?.Id ?? null
  }

  async createBug<T>({ title, card, bugContent, origin, releaseId, projectId, teamId }: { title: string, card: { id: string, type: "UserStory" | "Bug" | "Feature" }, bugContent: string, origin?: string, releaseId?: string, projectId?: string, teamId?: string }): Promise<TpResult<T>> {
    // A bug belongs on the project of the card it was raised from, which is a
    // better answer than the configured default and does not depend on
    // TP_PROJECT_ID being set. Mirrors how createTask resolves its project.
    const resolvedProjectId = projectId || await this.getAssignableProjectId(card.id) || config.tp.projectId
    if (!resolvedProjectId) {
      return {
        ok: false,
        status: 0,
        body: `Cannot resolve the project for ${card.type} ${card.id}; pass projectId or set TP_PROJECT_ID`,
      }
    }

    const bug: Record<string, any> = {
      "Name": title,
      "Project": { "Id": resolvedProjectId },
      "Description": bugContent,
    }

    // TP rejects an empty reference, so only send a team when there is one.
    const resolvedTeamId = teamId || config.tp.teamId
    if (resolvedTeamId) bug["assignedTeams"] = [{ "team": { "id": resolvedTeamId } }]

    if (origin) {
      bug["customFields"] = [{
        "name": "Origin",
        "type": "DropDown",
        "value": origin
      }]
    }

    if (releaseId) bug["Release"] = { "Id": releaseId }

    if (card.type === "UserStory") {
      bug["UserStory"] = { "Id": card.id }
    } else if (card.type === "Feature") {
      bug["Feature"] = { "Id": card.id }
    }

    return this.postRaw<any, T>({
      pathParam: ["bugs"],
      param: { "format": "json" },
    }, bug)
  }

  async updateUserStorySubState<T>({
    id,
    teamId,
    teamAssignmentId,
    entityStateId
  }: { id: string, teamId?: string, teamAssignmentId?: string, entityStateId?: string }): Promise<T> {
    const userStory: Record<string, any> = { "id": id }

    if (entityStateId) userStory["assignedTeams"] = [{
      "id": teamAssignmentId,
      "team": {
        "id": teamId
      },
      "entityState": {
        "id": entityStateId
      }
    }]

    return this.post<any, T>({
      pathParam: ["UserStories", id],
      param: { "format": "json" },
    }, userStory) as T
  }

  async updateUserStory<T>({
    id,
    title,
    description,
    projectId,
    teamId,
    entityStateId,
    featureId,
    tags,
    effort,
    teamIterationId
  }: { id: string, title?: string, description?: string, projectId?: string, teamId?: string, teamAssignmentId?: string, entityStateId?: string, featureId?: string, tags?: string, effort?: number, teamIterationId?: string }): Promise<T> {
    const userStory: Record<string, any> = { "Id": id }

    if (title) userStory["Name"] = title
    if (description) userStory["Description"] = description
    if (projectId) userStory["Project"] = { "Id": projectId }
    if (teamId) userStory["assignedTeams"] = [{ "team": { "id": teamId } }]
    if (entityStateId) userStory["EntityState"] = { "Id": entityStateId }
    if (featureId) userStory["Feature"] = { "Id": featureId }
    if (tags) userStory["Tags"] = tags
    if (effort !== undefined) userStory["Effort"] = effort
    if (teamIterationId) userStory["TeamIteration"] = { "Id": teamIterationId }

    return this.post<any, T>({
      pathParam: ["UserStories"],
      param: { "format": "json" },
    }, userStory) as T
  }

  async updateUserStoryCustomFields<T>({
    id,
    backEnd,
    frontEnd,
    figma,
  }: {
    id: string
    backEnd?: string | null
    frontEnd?: string | null
    figma?: string | null
  }): Promise<T | Error> {
    const current = await this.get<{ Effort: number; CustomFields: Array<{ Name: string; Type: string; Value: unknown }> }>({
      pathParam: ["UserStories", id],
      param: { "format": "json", "include": "[Id,Effort,CustomFields]" },
    })
    if (current instanceof Error) return current
    if (!current) return new Error(`User story ${id} was not found`)

    const requested = new Map<string, string | null>()
    if (backEnd !== undefined) requested.set("BackEnd", backEnd)
    if (frontEnd !== undefined) requested.set("FrontEnd", frontEnd)
    if (figma !== undefined) requested.set("Figma", figma)

    for (const name of requested.keys()) {
      if (!current.CustomFields.some(({ Name }) => Name === name)) {
        return new Error(`Custom field "${name}" is not available on user story ${id}`)
      }
    }
    const customFields = [...requested].map(([name, value]) => {
      const field = current.CustomFields.find(({ Name }) => Name === name)!
      const apiValue = name === "Figma" && value !== null
        ? { "Url": value, "Label": "design" }
        : value
      return { "Name": field.Name, "Type": field.Type, "Value": apiValue }
    })

    const update = await this.postRaw<any, T>({
      pathParam: ["UserStories", id],
      param: { "format": "json" },
    }, { "Id": id, "Effort": current.Effort, "CustomFields": customFields })
    if (!update.ok) {
      return new Error(`HTTP status: ${update.status}; Response body: ${update.body}`)
    }

    const verified = await this.get<T & { Effort: number; CustomFields: Array<{ Name: string; Value: unknown }> }>({
      pathParam: ["UserStories", id],
      param: { "format": "json", "include": "[Id,Effort,CustomFields]" },
    })
    if (verified instanceof Error) return verified
    if (!verified) return new Error(`User story ${id} could not be read back after updating custom fields`)

    if (verified.Effort !== current.Effort) {
      return new Error(`User story effort changed while updating custom fields; expected ${current.Effort}, received ${verified.Effort}`)
    }

    for (const [name, value] of requested) {
      const field = verified.CustomFields.find(({ Name }) => Name === name)
      if (!field) return new Error(`Custom field "${name}" was missing from the update read-back`)
      const persistedValue = name === "Figma" && value !== null && typeof field.Value === "object" && field.Value !== null
        ? (field.Value as { Url?: unknown }).Url
        : field.Value
      if (persistedValue !== value) {
        return new Error(`Custom field "${name}" was not persisted; expected ${JSON.stringify(value)}, received ${JSON.stringify(persistedValue)}`)
      }
    }
    return verified
  }

  async setBusinessValue<T>({ id, entityType, priorityId }: { id: string, entityType: string, priorityId: string }): Promise<T> {
    const entity: Record<string, any> = { "Id": id, "Priority": { "Id": priorityId } }
    return this.post<any, T>({
      pathParam: [entityType, id],
      param: { "format": "json" },
    }, entity) as T
  }

  async updateBug<T>({ id, title, bugContent, origin, releaseId, projectId, teamId, entityStateId, tags, teamIterationId }: { id: string, title?: string, bugContent?: string, origin?: string, releaseId?: string, projectId?: string, teamId?: string, entityStateId?: string, tags?: string, teamIterationId?: string }): Promise<T> {
    const bug: Record<string, any> = { "Id": id }

    if (title) bug["Name"] = title
    if (bugContent) bug["Description"] = bugContent
    if (origin) bug["customFields"] = [{
      "name": "Origin",
      "type": "DropDown",
      "value": origin
    }]
    if (releaseId) bug["Release"] = { "Id": releaseId }
    if (projectId) bug["Project"] = { "Id": projectId }
    if (teamId) {
      bug["assignedTeams"] = [{
        "team": {
          "id": teamId || config.tp.teamId
        }
      }]
    }
    if (entityStateId) bug["entityState"] = { "Id": entityStateId }
    if (tags) bug["Tags"] = tags
    if (teamIterationId) bug["TeamIteration"] = { "Id": teamIterationId }

    return this.post<any, T>({
      pathParam: ["bugs"],
      param: { "format": "json" },
    }, bug) as T
  }

  async createBugOnly<T>({ title, bugContent, origin, releaseId, projectId, teamId, entityStateId, tags, teamIterationId }: BugInputSchema): Promise<TpResult<T>> {
    // No parent card to inherit from here, so an unset TP_PROJECT_ID has to be
    // reported rather than posted as an empty reference.
    const resolvedProjectId = projectId || config.tp.projectId
    if (!resolvedProjectId) {
      return {
        ok: false,
        status: 0,
        body: `Cannot create a bug without a project; pass projectId or set TP_PROJECT_ID`,
      }
    }

    const bug: Record<string, any> = {
      "Name": title,
      "Project": { "Id": resolvedProjectId },
      "Description": bugContent,
    }

    // TP rejects an empty reference, so only send a team when there is one.
    const resolvedTeamId = teamId || config.tp.teamId
    if (resolvedTeamId) bug["assignedTeams"] = [{ "team": { "id": resolvedTeamId } }]

    if (origin) {
      bug["customFields"] = [{
        "name": "Origin",
        "type": "DropDown",
        "value": origin
      }]
    }

    if (releaseId) bug["Release"] = { "Id": releaseId }
    if (entityStateId) bug["EntityState"] = { "Id": entityStateId }
    if (tags) bug["Tags"] = tags
    if (teamIterationId) bug["TeamIteration"] = { "Id": teamIterationId }

    return this.postRaw<any, T>({
      pathParam: ["bugs"],
      param: { "format": "json" },
    }, bug)
  }

  async createUserStory<T>({ title, description, featureId, releaseId, projectId, teamId, tags, teamIterationId }: { title: string, description?: string, featureId?: string, releaseId?: string, projectId?: string, teamId?: string, tags?: string, teamIterationId?: string }): Promise<T> {
    const userStory: Record<string, any> = {
      "Name": title,
      "Project": { "Id": projectId || config.tp.projectId },
      "assignedTeams": [{ "team": { "id": teamId || config.tp.teamId } }],
    }

    if (description) userStory["Description"] = description
    if (featureId) userStory["Feature"] = { "Id": featureId }
    if (releaseId) userStory["Release"] = { "Id": releaseId }
    if (tags) userStory["Tags"] = tags
    if (teamIterationId) userStory["TeamIteration"] = { "Id": teamIterationId }

    return this.post<any, T>({
      pathParam: ["UserStories"],
      param: { "format": "json" },
    }, userStory) as T
  }

  async getTeamIterations<T>({ teamId }: { teamId?: string } = {}): Promise<T> {
    return this.get<T>({
      pathParam: ["TeamIterations"],
      param: {
        "format": "json",
        ...(teamId ? { "where": `Team.Id eq ${teamId}` } : {}),
        "include": "[Id,Name,StartDate,EndDate,Team[Id,Name]]",
      },
    }) as T
  }


  async getEpic<T>(epicId: string): Promise<T> {
    return this.get<T>({
      pathParam: ["Epics", epicId],
      param: { "format": "json" },
    }) as T
  }

  async updateEpic<T>({ id, title, description, releaseId, projectId }: { id: string, title?: string, description?: string, releaseId?: string, projectId?: string }): Promise<T> {
    const epic: Record<string, any> = { "Id": id }
    if (title) epic["Name"] = title
    if (description) epic["Description"] = description
    if (projectId) epic["Project"] = { "Id": projectId }
    if (releaseId) epic["Release"] = { "Id": releaseId }

    return this.post<any, T>({
      pathParam: ["Epics"],
      param: { "format": "json" },
    }, epic) as T
  }

  async getEpicFeatures<T>(epicId: string): Promise<T> {
    return this.get<T>({
      pathParam: ["Features"],
      param: {
        "format": "json",
        "where": `Epic.Id eq ${epicId}`,
        "include": "[Id,Name,Description,EntityState[Name],Team[Name],Release[Name],Progress,Effort]",
        "take": 100,
      },
    }) as T
  }

  async createEpic<T>({ title, description, releaseId, projectId }: { title: string, description?: string, releaseId?: string, projectId?: string }): Promise<T | null> {
    const epic: Record<string, any> = {
      "Name": title,
      "Project": { "Id": projectId || config.tp.projectId },
    }

    if (description) epic["Description"] = description
    if (releaseId) epic["Release"] = { "Id": releaseId }

    return this.post<any, T>({
      pathParam: ["Epics"],
      param: { "format": "json" },
    }, epic)
  }

  async createFeature<T>({ title, description, epicId, releaseId, projectId, teamId }: { title: string, description?: string, epicId?: string, releaseId?: string, projectId?: string, teamId?: string }): Promise<T> {
    const feature: Record<string, any> = {
      "Name": title,
      "Project": { "Id": projectId || config.tp.projectId },
      "assignedTeams": [{ "team": { "id": teamId || config.tp.teamId } }],
    }

    if (description) feature["Description"] = description
    if (epicId) feature["Epic"] = { "Id": epicId }
    if (releaseId) feature["Release"] = { "Id": releaseId }

    return this.post<any, T>({
      pathParam: ["Features"],
      param: { "format": "json" },
    }, feature) as T
  }

  async updateFeature<T>({
    id,
    title,
    description,
    epicId,
    releaseId,
    projectId,
    teamId,
    entityStateId,
    tags,
    teamIterationId
  }: { id: string, title?: string, description?: string, epicId?: string, releaseId?: string, projectId?: string, teamId?: string, entityStateId?: string, tags?: string, teamIterationId?: string }): Promise<T> {
    const feature: Record<string, any> = { "Id": id }

    if (title) feature["Name"] = title
    if (description) feature["Description"] = description
    if (epicId) feature["Epic"] = { "Id": epicId }
    if (releaseId) feature["Release"] = { "Id": releaseId }
    if (projectId) feature["Project"] = { "Id": projectId }
    if (teamId) feature["assignedTeams"] = [{ "team": { "id": teamId } }]
    if (entityStateId) feature["EntityState"] = { "Id": entityStateId }
    if (tags) feature["Tags"] = tags
    if (teamIterationId) feature["TeamIteration"] = { "Id": teamIterationId }

    return this.post<any, T>({
      pathParam: ["Features"],
      param: { "format": "json" },
    }, feature) as T
  }

  async createBugBasedOnUserStory<T>(title: string, userStoryId: string, bugContent: string): Promise<T> {
    const bug = {
      "Name": title,
      "Project": { "Id": config.tp.projectId },
      "UserStory": { "Id": userStoryId },
      "assignedTeams": [{
        "team": {
          "id": config.tp.teamId
        }
      }],
      "Description": bugContent,
    }

    return this.post<any, T>({
      pathParam: ["bugs"],
      param: { "format": "json" },
    }, bug) as T
  }

  async createTestCase<T>(name: string, description: string, testPlanId: string): Promise<T> {
    const testCase = {
      "Name": name,
      "Project": { "Id": config.tp.projectId },
      "Description": description,
      "TestPlans": [{
        "Id": testPlanId
      }],
    }

    return this.post<any, T>({
      pathParam: ["testCases"],
      param: { "format": "json" },
    }, testCase) as T
  }

  async createTestPlan<T>(title: string, resourceId: string, resourceType: 'UserStory' | 'Bug' | 'Feature' = 'UserStory', options?: { description?: string; startDate?: string; endDate?: string }): Promise<T> {
    const testPlan: Record<string, any> = {
      "Name": `Test Plan: ${title}`,
      "Project": {
        "Id": config.tp.projectId
      },
      "LinkedGeneral": {
        "ResourceType": "General",
        "Id": resourceId,
        "Name": title,
      },
      "LinkedAssignable": {
        "ResourceType": "Assignable",
        "Id": resourceId,
        "Name": title,
      },
    }

    if (resourceType === 'UserStory') {
      testPlan["LinkedUserStory"] = { "ResourceType": "UserStory", "Id": resourceId, "Name": title }
    } else if (resourceType === 'Bug') {
      testPlan["LinkedBug"] = { "ResourceType": "Bug", "Id": resourceId, "Name": title }
    } else if (resourceType === 'Feature') {
      testPlan["LinkedFeature"] = { "ResourceType": "Feature", "Id": resourceId, "Name": title }
    }

    if (options?.description) testPlan["Description"] = options.description
    if (options?.startDate) testPlan["StartDate"] = options.startDate
    if (options?.endDate) testPlan["EndDate"] = options.endDate

    return this.post<any, T>({
      pathParam: ["testPlans"],
      param: { "format": "json" },
    }, testPlan) as T
  }

  async getUser<T>(userId: string): Promise<T> {
    return this.get<T>({
      pathParam: ["Users", userId],
      param: { "format": "json" },
    }) as T
  }

  async getUsers<T>(): Promise<T> {
    return this.get<T>({
      pathParam: ["Users"],
      param: { "format": "json" },
    }) as T
  }

  async addCommentWithUser<T>(userStoryId: string, comment: string, user: LoggedUser): Promise<T> {
    const userAt = user ? `cc - <div>@user:${user.Email}[${user.FirstName} ${user.LastName}]&nbsp;</div>` : ''
    const commentContent = `${comment}\nn${userAt}`
    const commentData = {
      description: commentContent,
      owner: {
        id: config.tp.ownerId
      },
      general: {
        id: userStoryId,
      },
    }

    return this.post<any, T>({
      pathParam: ["comments"],
      param: { "format": "json" },
    }, commentData) as T
  }

  async addComment<T>(userStoryId: string, comment: string): Promise<T> {
    const commentData = {
      description: comment,
      owner: {
        id: config.tp.ownerId
      },
      general: {
        id: userStoryId,
      },
    }

    return this.post<any, T>({
      pathParam: ["comments"],
      param: { "format": "json" },
    }, commentData) as T
  }

  async addTestStep<T>(testCaseId: string, testStep: { description: string, result: string }): Promise<T> {
    const testStepData = {
      "Description": testStep.description,
      "Result": testStep.result,
      "TestCase": { "Id": testCaseId },
    }

    return this.post<any, T>({
      pathParam: ["testSteps"],
      param: { "format": "json" },
    }, testStepData) as T
  }

  async getBugComments<T>(bugId: string, results: number = 25): Promise<T> {
    const response = await this.get<T>({
      pathParam: ["Bugs", bugId, "Comments"],
      param: {
        "format": "json",
        "take": results,
      }
    }) as T

    return response
  }

  async getUserStoryComments<T>(userStoryId: string, results: number = 25): Promise<T> {
    const response = await this.get<T>({
      pathParam: ["UserStories", userStoryId, "Comments"],
      param: {
        "format": "json",
        "take": results,
      }
    }) as T

    return response
  }

  async getFeatureComments<T>(featureId: string, results: number = 25): Promise<T> {
    const response = await this.get<T>({
      pathParam: ["Features", featureId, "Comments"],
      param: {
        "format": "json",
        "take": results,
      }
    }) as T

    return response
  }

  async searchContainsNameText<T>({ text, entityType }: { text: string, entityType: "Generals" | "UserStories" | "Bugs" | "Features" }): Promise<T> {
    return this.get<T>({
      pathParam: [entityType],
      param: {
        "format": "json",
        "take": "25",
        "where": `Name contains '${text}'`,
        "include": "[Name, Description, Id]"
      },
    }) as T
  }

  async searchContainsDescriptionText<T>({ text, entityType }: { text: string, entityType: "Generals" | "UserStories" | "Bugs" | "Features" }): Promise<T> {
    return this.get<T>({
      pathParam: [entityType],
      param: {
        "where": `Description contains '${text}' and EntityState.Name eq 'Done'`,
        "format": "json",
        "take": "100",
      },
    }) as T
  }

  async getCurrentReleases<T>(): Promise<T> {
    return this.get<T>({
      pathParam: ["Releases"],
      param: {
        "format": "json",
        "where": `IsCurrent eq 'true'`,
      },
    }) as T
  }

  async getReleaseUserStories<T>({ name, results = 100, withDescription = false }: { name: string, results?: number, withDescription?: boolean }): Promise<T> {
    const includeFilter = withDescription ? "[Name, Description, Id]" : "[Name, Id]"
    return this.get<T>({
      pathParam: ["UserStories"],
      param: {
        "format": "json",
        "take": results,
        "where": `Release.Name eq '${name}'`,
        "include": includeFilter,
      }
    }) as T
  }

  async getReleaseOpenUserStories<T>({ name, results = 300, withDescription = false }: { name: string, results?: number, withDescription?: boolean }): Promise<T> {
    const includeFilter = withDescription ? "[Name, Description, Id]" : "[Name, Id]"
    return this.get<T>({
      pathParam: ["UserStories"],
      param: {
        "format": "json",
        "take": results,
        "where": `Release.Name eq '${name}' and EntityState.Name ne 'Closed' and EntityState.Name ne 'Done' and EntityState.Name ne 'Passed Dev01  QA' and EntityState.Name ne 'Ready to Deploy to prod'`,
        "include": includeFilter,
      }
    }) as T
  }

  async getReleaseOpenBugs<T>({ name, results = 300, withDescription = false }: { name: string, results?: number, withDescription?: boolean }): Promise<T> {
    const includeFilter = withDescription ? "[Name, Description, Id]" : "[Name, Id]"
    return this.get<T>({
      pathParam: ["Bugs"],
      param: {
        "format": "json",
        "take": results,
        "where": `Release.Name eq '${name}' and EntityState.Name ne 'Closed' and EntityState.Name ne 'Done' and EntityState.Name ne 'Passed Dev01  QA' and EntityState.Name ne 'Ready to Deploy to prod'`,
        "include": includeFilter,
      }
    }) as T
  }

  async getReleaseBugs<T>({ name, results = 500, withDescription = false }: { name: string, results?: number, withDescription?: boolean }): Promise<T> {
    const includeFilter = withDescription ? "[Name, Description, Id, Creator, Owner, Team]" : "[Name, Id]"
    return this.get<T>({
      pathParam: ["Bugs"],
      param: {
        "format": "json",
        "take": results,
        "where": `Release.Name eq '${name}'`,
        "include": includeFilter,
      }
    }) as T
  }

  async getReleaseFeatures<T>({ name, results = 100, withDescription = false }: { name: string, results?: number, withDescription?: boolean }): Promise<T> {
    const includeFilter = withDescription ? "[Name, Description, Id]" : "[Name, Id]"
    return this.get<T>({
      pathParam: ["Features"],
      param: {
        "format": "json",
        "take": results,
        "where": `Release.Name eq '${name}'`,
        "include": includeFilter,
      }
    }) as T
  }

  async getFeatureUserStories<T>(featureId: string): Promise<T> {
    return this.get<T>({
      pathParam: ["features"],
      param: {
        "format": "json",
        "where": `(id==${featureId})`,
        "select": `{userStories}`,
      },
      apiVersion: this.v2
    }) as T
  }

  async getUserStoryBugs<T>(userStoryId: string): Promise<T> {
    return this.get<T>({
      pathParam: ["userstories"],
      param: {
        "format": "json",
        "where": `(id==${userStoryId})`,
        "select": `{bugs}`,
      },
      apiVersion: this.v2
    }) as T
  }

  async getUserStoriesIdsByFeatureId<T>(featureId: string): Promise<T> {
    return this.get<T>({
      pathParam: ["userstories"],
      param: {
        "format": "json",
        "where": `(Feature.Id==${featureId})`,
        "select": `{id}`,
      },
      apiVersion: this.v2
    }) as T
  }

  async getUserStoryTestPlan<T>(userStoryId: string): Promise<T> {
    return this.get<T>({
      pathParam: ["userStories", userStoryId],
      param: {
        "format": "json",
        "select": `{id,storyName:name,linkedtestplan}`,
      },
      apiVersion: this.v2
    }) as T
  }

  async getCardTestPlan<T>(cardId: string, resourceType: 'UserStory' | 'Bug' | 'Feature' = 'UserStory'): Promise<T> {
    const pathMap = { UserStory: "userStories", Bug: "bugs", Feature: "features" }
    return this.get<T>({
      pathParam: [pathMap[resourceType], cardId],
      param: {
        "format": "json",
        "select": `{id,linkedtestplan}`,
      },
    }) as T
  }


  private toTestPlanNode(testPlan: Partial<TestPlan> | null, fallbackId?: string): TestPlanNode | null {
    const id = testPlan?.Id ?? fallbackId
    if (id === undefined || id === null) return null

    const numericId = Number(id)

    return {
      id: String(id),
      numericId: Number.isNaN(numericId) ? 0 : numericId,
      name: testPlan?.Name,
    }
  }

  private async getDirectTestPlanTestCaseItems(testPlan: TestPlanNode): Promise<TestCase[] | null> {
    const items = await this.getAllOrNull<TestCase>({
      pathParam: ["testPlans", testPlan.id, "testcases"],
      param: { "format": "json" },
    })

    if (!items) return null

    return items.map((item) => ({
      ...item,
      TestPlanId: testPlan.numericId,
      TestPlanName: testPlan.name || item.LinkedTestPlan?.Name,
    }))
  }

  private async getChildTestPlanNodes(testPlanId: string): Promise<TestPlanNode[] | null> {
    const items = await this.getAllOrNull<Partial<TestPlan>>({
      pathParam: ["testPlans"],
      param: {
        "format": "json",
        "where": `ParentTestPlans.Id eq ${testPlanId}`,
        "include": "[Id,Name,ParentTestPlans[Id,Name]]",
      },
    })

    if (!items) return null

    return items
      .map((item) => this.toTestPlanNode(item))
      .filter((item): item is TestPlanNode => Boolean(item))
  }

  async getIndirectTestPlanTestCases<T>(testPlanId: string): Promise<T> {
    const rootTestPlan = await this.getTestPlan<TestPlan>(testPlanId)
    const rootTestPlanNode = this.toTestPlanNode(rootTestPlan, testPlanId)
    if (!rootTestPlanNode) return null as T

    const queue: TestPlanNode[] = [rootTestPlanNode]
    const visitedPlanIds = new Set<string>()
    const seenTestCaseIds = new Set<string>()
    const testCases: TestCase[] = []

    while (queue.length > 0) {
      const testPlan = queue.shift()!
      if (visitedPlanIds.has(testPlan.id)) continue
      visitedPlanIds.add(testPlan.id)

      const directTestCases = await this.getDirectTestPlanTestCaseItems(testPlan)
      if (!directTestCases) return null as T

      for (const testCase of directTestCases) {
        const testCaseId = String(testCase.Id)
        if (seenTestCaseIds.has(testCaseId)) continue
        seenTestCaseIds.add(testCaseId)
        testCases.push(testCase)
      }

      const childTestPlans = await this.getChildTestPlanNodes(testPlan.id)
      if (!childTestPlans) return null as T

      for (const childTestPlan of childTestPlans) {
        if (!visitedPlanIds.has(childTestPlan.id)) queue.push(childTestPlan)
      }
    }

    return { Next: "", Items: testCases } as T
  }


  async getTestPlanTestCases<T>(testPlanId: string): Promise<T> {
    return this.get<T>({
      pathParam: ["testPlans", testPlanId, "testcases"],
      param: { "format": "json" },
    }) as T
  }

  async getTestCaseSteps<T>(testCaseId: string): Promise<T> {
    return this.get<T>({
      pathParam: ["testCases", testCaseId, "teststeps"],
      param: { "format": "json" },
    }) as T
  }

  async getTestCase<T>(testCaseId: string): Promise<T> {
    return this.get<T>({
      pathParam: ["testCases", testCaseId],
      param: { "format": "json" },
    }) as T
  }

  async updateTestCase<T>({ id, name, description }: { id: string, name?: string, description?: string }): Promise<T> {
    const testCase: Record<string, any> = { "Id": id }

    if (name !== undefined) testCase["Name"] = name
    if (description !== undefined) testCase["Description"] = description

    return this.post<any, T>({
      pathParam: ["testCases"],
      param: { "format": "json" },
    }, testCase) as T
  }

  async getTestStep<T>(testStepId: string): Promise<T> {
    return this.get<T>({
      pathParam: ["testSteps", testStepId],
      param: { "format": "json" },
    }) as T
  }

  async updateTestStep<T>({ id, description, result }: { id: string, description?: string, result?: string }): Promise<T> {
    const testStep: Record<string, any> = { "Id": id }

    if (description !== undefined) testStep["Description"] = description
    if (result !== undefined) testStep["Result"] = result

    return this.post<any, T>({
      pathParam: ["testSteps"],
      param: { "format": "json" },
    }, testStep) as T
  }

  async deleteTestStep<T>(testStepId: string): Promise<TpResult<T>> {
    return this.del<T>({
      pathParam: ["testSteps", testStepId],
      param: { "format": "json" },
    })
  }

  async deleteCard<T>({ id, type }: { id: string, type: "Bug" | "UserStory" | "Feature" | "Epic" }): Promise<TpResult<T>> {
    const pathSegment: Record<typeof type, string> = {
      "Bug": "bugs",
      "UserStory": "userStories",
      "Feature": "features",
      "Epic": "Epics",
    }

    return this.del<T>({
      pathParam: [pathSegment[type], id],
      param: { "format": "json" },
    })
  }

  async getProjects<T>(): Promise<T> {
    return this.get<T>({
      pathParam: ["Projects"],
      param: { "format": "json" },
    }) as T
  }

  async getPriorities<T>(): Promise<T> {
    return this.get<T>({
      pathParam: ["Priorities"],
      param: { "format": "json", "take": "200" },
    }) as T
  }

  async getProcessWorkflows<T>({ processId }: { processId?: string }): Promise<T> {
    return this.get<T>({
      pathParam: ["Process"],
      param: {
        "format": "json",
        "where": `id=(${processId})`,
        "select": `{Workflows}`
      },
      apiVersion: this.v2
    }) as T
  }

  async getUserStories<T>({ take = 100 }: { take?: number }): Promise<T> {
    return this.get<T>({
      pathParam: ["userStories"],
      param: {
        "format": "json",
        "take": take,
      },
      apiVersion: this.v2
    }) as T
  }

  async getProcesses<T>(): Promise<T> {
    return this.get<T>({
      pathParam: ["Processes"],
      param: { "format": "json" },
    }) as T
  }

  async getTeamAssignments<T>(): Promise<T> {
    return this.get<T>({
      pathParam: ["TeamAssignments"],
      param: { "format": "json" },
    }) as T
  }

  async getTeams<T>(): Promise<T> {
    return this.get<T>({
      pathParam: ["Teams"],
      param: { "format": "json" },
    }) as T
  }

  // Cards inherit the workflow of their project's process, so entity states
  // are resolved from a project rather than from a configured process id.
  async getProjectProcess(projectId: string): Promise<{ Id: number, Name: string, Process: { Id: number, Name: string } } | Error | null> {
    return this.get<{ Id: number, Name: string, Process: { Id: number, Name: string } }>({
      pathParam: ["Projects", projectId],
      param: { "format": "json", "include": "[Id,Name,Process[Id,Name]]" },
    })
  }

  // Filtered through Workflow because the EntityState.Process and
  // EntityState.EntityType fields are deprecated. The entity type is a fixed
  // union rather than free text so it cannot be injected into the filter.
  async getEntityStates(processId: string, entityType: 'Task' | 'UserStory' | 'Bug'): Promise<TpResponse<WorkflowEntityState> | Error | null> {
    return this.get<TpResponse<WorkflowEntityState>>({
      pathParam: ["EntityStates"],
      param: {
        "format": "json",
        "where": `Workflow.Process.Id eq ${parseInt(processId)} and Workflow.EntityType.Name eq '${entityType}'`,
        "include": "[Id,Name,NumericPriority,IsInitial,IsFinal,Workflow[Id,Name,ParentWorkflow[Id,Name]]]",
        "orderBy": "NumericPriority",
        "take": 100,
      },
    })
  }

  async getCardStatus<T>(cardId: string, resourceType: 'UserStory' | 'Bug' | 'Feature' = 'UserStory'): Promise<T> {
    const pathMap = { UserStory: 'userStory', Bug: 'bug', Feature: 'feature' }
    return this.get<T>({
      pathParam: [pathMap[resourceType]],
      param: {
        "select": `{Project:{Project.Id},EntityState:{EntityState.Id,EntityState.Name,EntityState.NextStates,EntityState.Workflow.Id as WorkflowId},TeamState:{ResponsibleTeam.Id,Team:{ResponsibleTeam.Team.Id,ResponsibleTeam.Team.Name},EntityState:{ResponsibleTeam.EntityState.Id,ResponsibleTeam.EntityState.Name,ResponsibleTeam.EntityState.Workflow.Id as WorkflowId}},AssignedTeams.Select({TeamAssignmentId:Id,Id:Team.Id,Name:Team.Name}) as Teams}`,
        "where": `(id=${cardId})`,
        "take": "1",
      },
      apiVersion: this.v2
    }) as T
  }

  async getContext<T>(): Promise<T> {
    return this.get<T>({
      pathParam: ["Context"],
      param: { "format": "json" }
    }) as T
  }

  async getInProgressTasksAndBugs(userId: string): Promise<{ tasks: Task[], bugs: Bug[] }> {
    const where = `(EntityState.Name eq 'In Progress') and (AssignedUser.Id eq ${userId})`
    const include = "[Id,Name,EntityState[Name],UserStory[Id,Name,Feature[Id,Name]]]"
    const param = { "format": "json", "where": where, "include": include, "orderByDesc": "ModifyDate" }

    const [tasks, bugs] = await Promise.all([
      this.get<TpResponse<Task>>({ pathParam: ["Tasks"], param }),
      this.get<TpResponse<Bug>>({ pathParam: ["Bugs"], param }),
    ])

    return {
      tasks: tasks?.Items ?? [],
      bugs: bugs?.Items ?? [],
    }
  }

  async getTask<T>(taskId: string): Promise<T> {
    const response = await this.get<T>({
      pathParam: ["Tasks", taskId],
      param: {
        "format": "json",
        "include": "[Id,Name,Description,Effort,EntityState[Id,Name],Project[Id,Name],UserStory[Id,Name,Feature[Id,Name]],AssignedTeams[Id,Team[Id,Name]]]",
      }
    }) as T

    return response
  }

  async getUserStoryTasks(userStoryId: string): Promise<Task[] | Error> {
    const id = parseInt(userStoryId)
    const tasks: Task[] = []
    const take = 100
    let skip = 0
    while (true) {
      const page = await this.get<TpResponse<Task>>({
        pathParam: ["Tasks"],
        param: {
          "format": "json",
          "where": `UserStory.Id eq ${id}`,
          "include": "[Id,Name,Description,Effort,Project[Id,Name],UserStory[Id,Name]]",
          take,
          skip,
        },
      })
      if (page instanceof Error) return page
      if (!page?.Items?.length) return tasks
      tasks.push(...page.Items)
      if (!page.Next) return tasks
      skip += take
    }
  }

  async getBugWithRelations<T>(bugId: string): Promise<T> {
    const response = await this.get<T>({
      pathParam: ["Bugs", bugId],
      param: {
        "format": "json",
        "include": "[Id,Name,UserStory[Id,Name,Feature[Id,Name]]]",
      }
    }) as T

    return response
  }

  async createTask<T>({ title, description, userStoryId }: { title: string, description?: string, userStoryId: string }): Promise<TpResult<T>> {
    const userStory = await this.get<{ Project?: { Id?: number } }>({
      pathParam: ["UserStories", userStoryId],
      param: { "format": "json", "include": "[Id,Project[Id]]" },
    })
    if (userStory instanceof Error) return { ok: false, status: 0, body: userStory.message }
    const projectId = userStory?.Project?.Id
    if (!projectId) {
      return { ok: false, status: 0, body: `Cannot resolve the project for user story ${userStoryId}` }
    }

    const task: Record<string, any> = {
      "Name": title,
      "Project": {
        "Id": projectId
      },
      "UserStory": {
        "Id": userStoryId
      },
    }

    if (description) {
      task["Description"] = description
    }

    return this.postRaw<any, T>({
      pathParam: ["Tasks"],
      param: { "format": "json" },
    }, task)
  }

  // Tasks inherit the workflow of their project's process, so the states a
  // task may be moved to are resolved from the task itself rather than from a
  // configured process id.
  async getTaskProcess(taskId: string): Promise<{ Id: number, Name: string, Project: { Id: number, Name: string, Process: { Id: number, Name: string } } } | Error | null> {
    return this.get<{ Id: number, Name: string, Project: { Id: number, Name: string, Process: { Id: number, Name: string } } }>({
      pathParam: ["Tasks", taskId],
      param: { "format": "json", "include": "[Id,Name,Project[Id,Name,Process[Id,Name]]]" },
    })
  }

  async updateTask<T>({ id, description, effort, entityStateId, teamId }: { id: string, description?: string, effort?: number, entityStateId?: string, teamId?: string }): Promise<T> {
    const task: Record<string, any> = { "Id": id }
    if (description !== undefined) task["Description"] = description
    if (effort !== undefined) task["Effort"] = effort
    if (entityStateId) task["EntityState"] = { "Id": entityStateId }
    // AssignedTeams is an add-only collection in the TP API, so this adds the
    // team to the task rather than replacing the teams already assigned.
    if (teamId) task["assignedTeams"] = [{ "team": { "id": teamId } }]

    return this.post<any, T>({
      pathParam: ["Tasks"],
      param: { "format": "json" },
    }, task) as T
  }

  async logTime<T>({
    entityId,
    entityType,
    hours,
    description,
    date,
  }: {
    entityId: string
    entityType: 'Task' | 'UserStory' | 'Bug'
    hours: number
    description?: string
    date?: string
  }): Promise<T> {
    const timestamp = date ? new Date(date).getTime() : Date.now()
    const body: Record<string, any> = {
      Spent: hours,
      Date: `/Date(${timestamp})/`,
      User: { Id: config.tp.ownerId },
      Assignable: { Id: entityId, ResourceType: entityType },
    }
    if (description) body["Description"] = description

    return this.post<any, T>({
      pathParam: ["Times"],
      param: { "format": "json" },
    }, body) as T
  }

  async assignRole(cardId: string, userId: string, roleId: string): Promise<RoleAssignment | null> {
    return this.post<any, RoleAssignment>({
      pathParam: ["Assignments"],
      param: { "format": "json" },
    }, {
      Assignable: { Id: parseInt(cardId) },
      GeneralUser: { Id: parseInt(userId) },
      Role: { Id: parseInt(roleId) },
    })
  }

  async getRoleAssignments(cardId: string, userId: string, roleId: string): Promise<TpResponse<RoleAssignment> | Error | null> {
    const assignableId = parseInt(cardId)
    const generalUserId = parseInt(userId)
    const assignmentRoleId = parseInt(roleId)
    return this.get<TpResponse<RoleAssignment>>({
      pathParam: ["Assignments"],
      param: {
        "format": "json",
        "where": `Assignable.Id eq ${assignableId} and GeneralUser.Id eq ${generalUserId} and Role.Id eq ${assignmentRoleId}`,
        "include": "[Id,Assignable[Id,Name],GeneralUser[Id,FirstName,LastName,Login,FullName],Role[Id,Name]]",
        "take": 2,
      },
    })
  }

  // Every user/role assignment on one card. getRoleAssignments answers "is
  // this exact assignment present?"; this answers "who is on this card?",
  // which is what surfaces the people TP assigns by default on creation.
  async getCardAssignments(cardId: string): Promise<TpResponse<RoleAssignment> | Error | null> {
    return this.get<TpResponse<RoleAssignment>>({
      pathParam: ["Assignments"],
      param: {
        "format": "json",
        "where": `Assignable.Id eq ${parseInt(cardId)}`,
        "include": "[Id,Assignable[Id,Name],GeneralUser[Id,FirstName,LastName,Login,FullName],Role[Id,Name]]",
        "take": 100,
      },
    })
  }

  async deleteRoleAssignment(assignmentId: string): Promise<TpResult<RoleAssignment>> {
    return this.del<RoleAssignment>({
      pathParam: ["Assignments", assignmentId],
      param: { "format": "json" },
    })
  }

  async assignRoleToAllStoriesInFeature(featureId: string, userId: string, roleId: string): Promise<{ succeeded: RoleAssignment[]; failed: number[] }> {
    const storiesResponse = await this.getFeatureUserStories<{ items: { userStories: { items: { id: number; name: string }[] } }[] }>(featureId)
    const storyItems = storiesResponse?.items?.[0]?.userStories?.items ?? []
    const succeeded: RoleAssignment[] = []
    const failed: number[] = []
    await Promise.all(storyItems.map(async (story) => {
      const result = await this.assignRole(String(story.id), userId, roleId)
      if (result && !(result instanceof Error)) {
        succeeded.push(result)
      } else {
        failed.push(story.id)
      }
    }))
    return { succeeded, failed }
  }

  async getAssignmentRoles<T>(): Promise<T | null> {
    return this.get<T>({
      pathParam: ["Roles"],
      param: { "format": "json" },
    })
  }

  // Per-role effort ("Developer", "Designer", ...) on a card. The card's own
  // Effort field is the total TP computes from these rows, so a per-role
  // estimate has to be written through the RoleEffort entity instead.
  // Queried by Assignable id, which keeps this usable for any card type.
  async getRoleEfforts(entityId: string): Promise<TpResponse<RoleEffort> | Error | null> {
    return this.get<TpResponse<RoleEffort>>({
      pathParam: ["RoleEfforts"],
      param: {
        "format": "json",
        "where": `Assignable.Id eq ${parseInt(entityId)}`,
        "include": "[Id,Effort,EffortCompleted,EffortToDo,TimeSpent,TimeRemain,Role[Id,Name],Assignable[Id,Name]]",
        "take": 100,
      },
    })
  }

  async updateRoleEffort(roleEffortId: string, effort: number): Promise<TpResult<RoleEffort>> {
    return this.postRaw<any, RoleEffort>({
      pathParam: ["RoleEfforts", roleEffortId],
      param: { "format": "json" },
    }, { "Id": parseInt(roleEffortId), "Effort": effort })
  }

  // Only needed for a role that has no RoleEffort row on the card yet; TP
  // creates them up front for the roles its process tracks effort for.
  async createRoleEffort(entityId: string, roleId: string, effort: number): Promise<TpResult<RoleEffort>> {
    return this.postRaw<any, RoleEffort>({
      pathParam: ["RoleEfforts"],
      param: { "format": "json" },
    }, {
      "Assignable": { "Id": parseInt(entityId) },
      "Role": { "Id": parseInt(roleId) },
      "Effort": effort,
    })
  }

  // Reads the computed total through the Assignable resource so the caller
  // does not have to know whether the card is a user story, task, or bug.
  async getAssignableEffort(entityId: string): Promise<{ Id: number, Name: string, Effort: number } | Error | null> {
    return this.get<{ Id: number, Name: string, Effort: number }>({
      pathParam: ["Assignables", entityId],
      param: { "format": "json", "include": "[Id,Name,Effort]" },
    })
  }

  async getMyTimeLogs<T>(take: number = 25): Promise<T> {
    return this.get<T>({
      pathParam: ["Times"],
      param: {
        "format": "json",
        "where": `User.Id eq ${config.tp.ownerId}`,
        "include": "[Id,Spent,Date,Description,Assignable[Id,Name,ResourceType]]",
        "orderByDesc": "Date",
        "take": take,
      },
    }) as T
  }

  async getMyUserStories<T>({ state, take = 25, skip = 0 }: { state?: string, take?: number, skip?: number }): Promise<T> {
    const whereParts = [`AssignedUser.Id eq ${config.tp.ownerId}`]
    if (state) whereParts.push(`EntityState.Name contains '${state}'`)

    return this.get<T>({
      pathParam: ["UserStories"],
      param: {
        "format": "json",
        "where": whereParts.join(' and '),
        "include": "[Id,Name,EntityState[Name],Effort,Project[Name],Feature[Id,Name],CreateDate,ModifyDate]",
        "orderByDesc": "ModifyDate",
        "take": take,
        "skip": skip,
      },
    }) as T
  }

  async getMyBugs<T>({ state, take = 25, skip = 0 }: { state?: string, take?: number, skip?: number }): Promise<T> {
    const whereParts = [`AssignedUser.Id eq ${config.tp.ownerId}`]
    if (state) whereParts.push(`EntityState.Name contains '${state}'`)

    return this.get<T>({
      pathParam: ["Bugs"],
      param: {
        "format": "json",
        "where": whereParts.join(' and '),
        "include": "[Id,Name,EntityState[Name],Severity[Name],Priority[Name],Project[Name],UserStory[Id,Name],CreateDate,ModifyDate]",
        "orderByDesc": "ModifyDate",
        "take": take,
        "skip": skip,
      },
    }) as T
  }

  // TP's Relations endpoint silently returns nothing for an OR across
  // Master.Id/Slave.Id, so we query each side separately and merge the results.
  async getCardRelations(cardId: string): Promise<TpResponse<Relation>> {
    const include = "[Id,RelationType[Name],Master[Id,Name,EntityType],Slave[Id,Name,EntityType]]"
    const query = (side: "Master" | "Slave") => this.get<TpResponse<Relation>>({
      pathParam: ["Relations"],
      param: {
        "format": "json",
        "where": `${side}.Id eq ${cardId}`,
        "include": include,
        "take": 100,
      },
    })

    const [asMaster, asSlave] = await Promise.all([query("Master"), query("Slave")])
    const items = [...(asMaster?.Items ?? []), ...(asSlave?.Items ?? [])]

    return { Next: "", Items: items }
  }

  async getRelationTypes<T>(): Promise<T> {
    return this.get<T>({
      pathParam: ["RelationTypes"],
      param: {
        "format": "json",
        "include": "[Id,Name]",
        "take": 100,
      },
    }) as T
  }

  // RelationType must be referenced by Id — passing it by Name makes TP try to
  // create a new RelationType resource, which returns 405 Method Not Allowed.
  async createRelation<T>({ masterId, slaveId, relationTypeId }: { masterId: string, slaveId: string, relationTypeId: string }): Promise<TpResult<T>> {
    const relation = {
      "Master": { "Id": masterId },
      "Slave": { "Id": slaveId },
      "RelationType": { "Id": relationTypeId },
    }

    return this.postRaw<any, T>({
      pathParam: ["Relations"],
      param: { "format": "json" },
    }, relation)
  }

  async deleteRelation<T>(relationId: string): Promise<TpResult<T>> {
    return this.del<T>({
      pathParam: ["Relations", relationId],
      param: { "format": "json" },
    })
  }

  async getTestPlan<T>(testPlanId: string): Promise<T> {
    return this.get<T>({
      pathParam: ["testPlans", testPlanId],
      param: { "format": "json" },
    }) as T
  }


  async addAttachedFile(generalId: string, source: { filePath: string } | { fileContent: string; fileName: string }): Promise<string | null> {
    let blob: Blob
    let fileName: string

    if ("filePath" in source) {
      blob = new Blob([readFileSync(source.filePath)])
      fileName = basename(source.filePath)
    } else {
      blob = new Blob([Buffer.from(source.fileContent, "base64")])
      fileName = source.fileName
    }

    const formData = new FormData()
    formData.append("generalId", generalId)
    formData.append("file", blob, fileName)

    const url = `${this.baseUrl}/UploadFile.ashx?access_token=${this.token}`
    console.error(JSON.stringify({ "UPLOAD_URL": this.redact(url) }, null, 2))

    try {
      const response = await fetch(url, {
        method: "POST",
        body: formData,
      })
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      return await response.text()
    } catch (error) {
      console.error("Error uploading file:", error)
      return null
    }
  }
}
