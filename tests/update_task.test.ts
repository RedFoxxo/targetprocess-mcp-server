import { afterEach, describe, expect, it, vi } from 'vitest'
import { handleUpdateTask } from '../src/handlers/update_task.js'
import type { TpClient } from '../src/tp.js'

const TOKEN = 'test-token'
const BASE_URL = 'https://tp.example.com'

async function loadClient() {
  vi.resetModules()
  vi.stubEnv('TP_TOKEN', TOKEN)
  vi.stubEnv('TP_BASE_URL', BASE_URL)
  const { TpClient } = await import('../src/tp.js')
  return new TpClient()
}

function stubSuccessfulUpdate() {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ Id: 36195, Description: '<p>Updated</p>' }),
  })
  vi.stubGlobal('fetch', fetchMock)
  vi.spyOn(console, 'error').mockImplementation(() => { })
  return fetchMock
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('updateTask description', () => {
  it('posts the supplied description to the Tasks collection', async () => {
    const tp = await loadClient()
    const fetchMock = stubSuccessfulUpdate()

    await tp.updateTask({ id: '36195', description: '<p>Updated</p>' })

    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/api/v1/Tasks/')
    expect(options.method).toBe('POST')
    expect(JSON.parse(String(options.body))).toEqual({
      Id: '36195',
      Description: '<p>Updated</p>',
    })
  })

  it('returns the updated task from the handler', async () => {
    const mockTp = {
      updateTask: vi.fn().mockResolvedValue({ Id: 36195, Description: '<p>Updated</p>' }),
    } as unknown as TpClient

    const result = await handleUpdateTask(mockTp, {
      id: '36195',
      description: '<p>Updated</p>',
    })

    expect(JSON.parse(result.content[0].text)).toMatchObject({ Id: 36195 })
  })
})

describe('updateTask effort', () => {
  it('includes a supplied effort estimate without changing the description', async () => {
    const tp = await loadClient()
    const fetchMock = stubSuccessfulUpdate()

    await tp.updateTask({ id: '36195', effort: 5 })

    const options = fetchMock.mock.calls[0][1] as RequestInit
    expect(JSON.parse(String(options.body))).toEqual({ Id: '36195', Effort: 5 })
  })

  it('includes zero so an estimate can be cleared', async () => {
    const tp = await loadClient()
    const fetchMock = stubSuccessfulUpdate()

    await tp.updateTask({ id: '36195', effort: 0 })

    const options = fetchMock.mock.calls[0][1] as RequestInit
    expect(JSON.parse(String(options.body))).toEqual({ Id: '36195', Effort: 0 })
  })

  it('can update description and effort together', async () => {
    const tp = await loadClient()
    const fetchMock = stubSuccessfulUpdate()

    await tp.updateTask({ id: '36195', description: '<p>Updated</p>', effort: 3 })

    const options = fetchMock.mock.calls[0][1] as RequestInit
    expect(JSON.parse(String(options.body))).toEqual({
      Id: '36195',
      Description: '<p>Updated</p>',
      Effort: 3,
    })
  })
})

describe('updateTask entity state', () => {
  it('posts the state as an EntityState reference', async () => {
    const tp = await loadClient()
    const fetchMock = stubSuccessfulUpdate()

    await tp.updateTask({ id: '36195', entityStateId: '742' })

    const options = fetchMock.mock.calls[0][1] as RequestInit
    expect(JSON.parse(String(options.body))).toEqual({
      Id: '36195',
      EntityState: { Id: '742' },
    })
  })

  it('does not touch the state when it is omitted', async () => {
    const tp = await loadClient()
    const fetchMock = stubSuccessfulUpdate()

    await tp.updateTask({ id: '36195', effort: 3 })

    const options = fetchMock.mock.calls[0][1] as RequestInit
    expect(JSON.parse(String(options.body))).not.toHaveProperty('EntityState')
  })

  it('passes the state through the handler', async () => {
    const mockTp = {
      updateTask: vi.fn().mockResolvedValue({ Id: 36195 }),
    } as unknown as TpClient

    await handleUpdateTask(mockTp, { id: '36195', entityStateId: '742' })

    expect(mockTp.updateTask).toHaveBeenCalledWith({ id: '36195', entityStateId: '742' })
  })
})

describe('updateTask team', () => {
  it('adds the team through the assignedTeams collection', async () => {
    const tp = await loadClient()
    const fetchMock = stubSuccessfulUpdate()

    await tp.updateTask({ id: '36195', teamId: '447' })

    const options = fetchMock.mock.calls[0][1] as RequestInit
    expect(JSON.parse(String(options.body))).toEqual({
      Id: '36195',
      assignedTeams: [{ team: { id: '447' } }],
    })
  })

  it('does not touch the teams when the team is omitted', async () => {
    const tp = await loadClient()
    const fetchMock = stubSuccessfulUpdate()

    await tp.updateTask({ id: '36195', description: '<p>Updated</p>' })

    const options = fetchMock.mock.calls[0][1] as RequestInit
    expect(JSON.parse(String(options.body))).not.toHaveProperty('assignedTeams')
  })

  it('can set the state and add a team in one update', async () => {
    const tp = await loadClient()
    const fetchMock = stubSuccessfulUpdate()

    await tp.updateTask({ id: '36195', entityStateId: '742', teamId: '447' })

    const options = fetchMock.mock.calls[0][1] as RequestInit
    expect(JSON.parse(String(options.body))).toEqual({
      Id: '36195',
      EntityState: { Id: '742' },
      assignedTeams: [{ team: { id: '447' } }],
    })
  })

  it('passes the team through the handler', async () => {
    const mockTp = {
      updateTask: vi.fn().mockResolvedValue({ Id: 36195 }),
    } as unknown as TpClient

    await handleUpdateTask(mockTp, { id: '36195', teamId: '447' })

    expect(mockTp.updateTask).toHaveBeenCalledWith({ id: '36195', teamId: '447' })
  })
})

describe('getTask', () => {
  // The Task type has always declared EntityState, but the include never
  // asked for it, so a task's state and teams could not be read back.
  it('requests the state and assigned teams', async () => {
    const tp = await loadClient()
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ Id: 36195 }) })
    vi.stubGlobal('fetch', fetchMock)
    vi.spyOn(console, 'error').mockImplementation(() => { })

    await tp.getTask('36195')

    const decoded = decodeURIComponent(String(fetchMock.mock.calls[0][0]))
    expect(decoded).toContain('EntityState[Id,Name]')
    expect(decoded).toContain('AssignedTeams[Id,Team[Id,Name]]')
  })
})
