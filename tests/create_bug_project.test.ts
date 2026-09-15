import { afterEach, describe, expect, it, vi } from 'vitest'

const TOKEN = 'test-token'
const BASE_URL = 'https://tp.example.com'

async function loadClient(env: Record<string, string> = {}) {
  vi.resetModules()
  vi.stubEnv('TP_TOKEN', TOKEN)
  vi.stubEnv('TP_BASE_URL', BASE_URL)
  vi.stubEnv('TP_PROJECT_ID', env.TP_PROJECT_ID ?? '')
  vi.stubEnv('TP_TEAM_ID', env.TP_TEAM_ID ?? '')
  const { TpClient } = await import('../src/tp.js')
  return new TpClient()
}

function stubFetch(...responses: Array<{ ok: boolean, json?: unknown, text?: string }>) {
  const fetchMock = vi.fn()
  for (const r of responses) {
    fetchMock.mockResolvedValueOnce({
      ok: r.ok,
      json: async () => r.json,
      text: async () => r.text ?? JSON.stringify(r.json ?? {}),
    })
  }
  vi.stubGlobal('fetch', fetchMock)
  vi.spyOn(console, 'error').mockImplementation(() => { })
  return fetchMock
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

// Regression: with TP_PROJECT_ID unset, createBug used to post
// Project: { Id: "" } and assignedTeams: [{ team: { id: "" } }], which TP
// rejects with a 400 that post() then discarded.
describe('createBug project resolution', () => {
  it('inherits the project of the card the bug is raised from', async () => {
    const tp = await loadClient()
    const fetchMock = stubFetch(
      { ok: true, json: { Id: 36410, Project: { Id: 26080 } } },
      { ok: true, json: { Id: 600 } },
    )

    const result = await tp.createBug({
      title: 'test',
      card: { id: '36410', type: 'UserStory' },
      bugContent: '<div>x</div>',
    })

    const lookupUrl = String(fetchMock.mock.calls[0][0])
    expect(lookupUrl).toContain('/api/v1/Assignables/36410/')

    const body = JSON.parse(String((fetchMock.mock.calls[1][1] as RequestInit).body))
    expect(body.Project).toEqual({ Id: 26080 })
    expect(body.UserStory).toEqual({ Id: '36410' })
    expect(result).toEqual({ ok: true, data: { Id: 600 } })
  })

  it('never posts an empty project or an empty team', async () => {
    const tp = await loadClient()
    const fetchMock = stubFetch(
      { ok: true, json: { Id: 36410, Project: { Id: 26080 } } },
      { ok: true, json: { Id: 600 } },
    )

    await tp.createBug({
      title: 'test',
      card: { id: '36410', type: 'UserStory' },
      bugContent: '<div>x</div>',
    })

    const body = JSON.parse(String((fetchMock.mock.calls[1][1] as RequestInit).body))
    expect(body.Project.Id).not.toBe('')
    expect(body).not.toHaveProperty('assignedTeams')
  })

  it('prefers an explicit projectId over the parent card', async () => {
    const tp = await loadClient()
    const fetchMock = stubFetch({ ok: true, json: { Id: 600 } })

    await tp.createBug({
      title: 'test',
      card: { id: '36410', type: 'UserStory' },
      bugContent: '<div>x</div>',
      projectId: '99',
    })

    // No parent lookup is needed when the caller supplied the project.
    expect(fetchMock.mock.calls).toHaveLength(1)
    const body = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body))
    expect(body.Project).toEqual({ Id: '99' })
  })

  it('sends a team when one is configured', async () => {
    const tp = await loadClient({ TP_TEAM_ID: '447' })
    const fetchMock = stubFetch(
      { ok: true, json: { Id: 36410, Project: { Id: 26080 } } },
      { ok: true, json: { Id: 600 } },
    )

    await tp.createBug({
      title: 'test',
      card: { id: '36410', type: 'UserStory' },
      bugContent: '<div>x</div>',
    })

    const body = JSON.parse(String((fetchMock.mock.calls[1][1] as RequestInit).body))
    expect(body.assignedTeams).toEqual([{ team: { id: '447' } }])
  })

  it('fails before posting when no project can be resolved', async () => {
    const tp = await loadClient()
    const fetchMock = stubFetch({ ok: true, json: { Id: 36410 } })

    const result = await tp.createBug({
      title: 'test',
      card: { id: '36410', type: 'UserStory' },
      bugContent: '<div>x</div>',
    })

    // Only the parent lookup happened; no bug was posted.
    expect(fetchMock.mock.calls).toHaveLength(1)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.body).toContain('Cannot resolve the project for UserStory 36410')
  })

  it('surfaces the status and body TP returned', async () => {
    const tp = await loadClient()
    stubFetch(
      { ok: true, json: { Id: 36410, Project: { Id: 26080 } } },
      { ok: false, text: 'Project is required' },
    )

    const result = await tp.createBug({
      title: 'test',
      card: { id: '36410', type: 'UserStory' },
      bugContent: '<div>x</div>',
    })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.body).toBe('Project is required')
  })
})

describe('createBugOnly project resolution', () => {
  it('fails before posting when TP_PROJECT_ID is unset and none is given', async () => {
    const tp = await loadClient()
    const fetchMock = stubFetch({ ok: true, json: { Id: 600 } })

    const result = await tp.createBugOnly({ title: 'test', bugContent: '<div>x</div>' })

    expect(fetchMock).not.toHaveBeenCalled()
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.body).toContain('Cannot create a bug without a project')
  })

  it('uses the configured project and omits an unset team', async () => {
    const tp = await loadClient({ TP_PROJECT_ID: '26080' })
    const fetchMock = stubFetch({ ok: true, json: { Id: 600 } })

    await tp.createBugOnly({ title: 'test', bugContent: '<div>x</div>' })

    const body = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body))
    expect(body.Project).toEqual({ Id: '26080' })
    expect(body).not.toHaveProperty('assignedTeams')
  })
})

// The same defect as createBug: an unset TP_PROJECT_ID produced
// Project: { Id: "" } and an empty assignedTeams entry on every creator.
describe('createUserStory project resolution', () => {
  it('inherits the project of the parent feature', async () => {
    const tp = await loadClient()
    const fetchMock = stubFetch(
      { ok: true, json: { Id: 36193, Project: { Id: 26080 } } },
      { ok: true, json: { Id: 700 } },
    )

    await tp.createUserStory({ title: 'story', featureId: '36193' })

    expect(String(fetchMock.mock.calls[0][0])).toContain('/api/v1/Assignables/36193/')
    const body = JSON.parse(String((fetchMock.mock.calls[1][1] as RequestInit).body))
    expect(body.Project).toEqual({ Id: 26080 })
    expect(body).not.toHaveProperty('assignedTeams')
  })

  it('fails before posting when there is no feature and no configured project', async () => {
    const tp = await loadClient()
    const fetchMock = stubFetch({ ok: true, json: { Id: 700 } })

    const result = await tp.createUserStory({ title: 'story' })

    expect(fetchMock).not.toHaveBeenCalled()
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.body).toContain('Cannot resolve the project for user story "story"')
  })
})

describe('createFeature project resolution', () => {
  it('inherits the project of the parent epic', async () => {
    const tp = await loadClient()
    const fetchMock = stubFetch(
      { ok: true, json: { Id: 500, Project: { Id: 26080 } } },
      { ok: true, json: { Id: 800 } },
    )

    await tp.createFeature({ title: 'feature', epicId: '500' })

    expect(String(fetchMock.mock.calls[0][0])).toContain('/api/v1/Assignables/500/')
    const body = JSON.parse(String((fetchMock.mock.calls[1][1] as RequestInit).body))
    expect(body.Project).toEqual({ Id: 26080 })
  })

  it('fails before posting when no project can be resolved', async () => {
    const tp = await loadClient()
    const fetchMock = stubFetch({ ok: true, json: { Id: 800 } })

    const result = await tp.createFeature({ title: 'feature' })

    expect(fetchMock).not.toHaveBeenCalled()
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.body).toContain('Cannot resolve the project for feature "feature"')
  })
})

describe('createEpic project resolution', () => {
  it('fails before posting when TP_PROJECT_ID is unset', async () => {
    const tp = await loadClient()
    const fetchMock = stubFetch({ ok: true, json: { Id: 900 } })

    const result = await tp.createEpic({ title: 'epic' })

    expect(fetchMock).not.toHaveBeenCalled()
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.body).toContain('Cannot create an epic without a project')
  })

  it('uses the configured project and surfaces TP errors', async () => {
    const tp = await loadClient({ TP_PROJECT_ID: '26080' })
    const fetchMock = stubFetch({ ok: false, text: 'Name is required' })

    const result = await tp.createEpic({ title: 'epic' })

    const body = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body))
    expect(body.Project).toEqual({ Id: '26080' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.body).toBe('Name is required')
  })
})
