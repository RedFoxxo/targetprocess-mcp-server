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
