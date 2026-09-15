import { afterEach, describe, expect, it, vi } from 'vitest'
import { handleSetRoleEffort } from '../src/handlers/set_role_effort.js'
import { handleGetRoleEfforts } from '../src/handlers/get_role_efforts.js'
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

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function roleEffort(Id: number, roleId: number, roleName: string, Effort: number) {
  return { Id, Effort, Role: { Id: roleId, Name: roleName } } as any
}

describe('role effort API requests', () => {
  it('queries the role efforts of one card', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ Items: [] }) })
    vi.stubGlobal('fetch', fetchMock)
    vi.spyOn(console, 'error').mockImplementation(() => { })
    const tp = await loadClient()

    await tp.getRoleEfforts('145789')

    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/api/v1/RoleEfforts/')
    expect(decodeURIComponent(url)).toContain('where=Assignable.Id eq 145789')
    expect(decodeURIComponent(url)).toContain('Role[Id,Name]')
    expect(options.method).toBe('GET')
  })

  it('updates an existing role effort row by its own ID', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: async () => JSON.stringify({ Id: 500 }) })
    vi.stubGlobal('fetch', fetchMock)
    vi.spyOn(console, 'error').mockImplementation(() => { })
    const tp = await loadClient()

    const result = await tp.updateRoleEffort('500', 8)

    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/api/v1/RoleEfforts/500/')
    expect(options.method).toBe('POST')
    expect(JSON.parse(String(options.body))).toEqual({ Id: 500, Effort: 8 })
    expect(result).toEqual({ ok: true, data: { Id: 500 } })
  })

  it('creates a role effort row for a role the card does not track yet', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: async () => JSON.stringify({ Id: 501 }) })
    vi.stubGlobal('fetch', fetchMock)
    vi.spyOn(console, 'error').mockImplementation(() => { })
    const tp = await loadClient()

    await tp.createRoleEffort('145789', '3', 2.5)

    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/api/v1/RoleEfforts/')
    expect(JSON.parse(String(options.body))).toEqual({
      Assignable: { Id: 145789 },
      Role: { Id: 3 },
      Effort: 2.5,
    })
  })

  it('reads the computed total through the Assignable resource', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ Id: 145789, Effort: 10 }) })
    vi.stubGlobal('fetch', fetchMock)
    vi.spyOn(console, 'error').mockImplementation(() => { })
    const tp = await loadClient()

    await tp.getAssignableEffort('145789')

    const [url] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/api/v1/Assignables/145789/')
    expect(decodeURIComponent(url)).toContain('include=[Id,Name,Effort]')
  })
})

describe('handleSetRoleEffort', () => {
  it('updates the existing row of each requested role and reports the new total', async () => {
    const mockTp = {
      getRoleEfforts: vi.fn()
        .mockResolvedValueOnce({ Items: [roleEffort(500, 1, 'Developer', 0), roleEffort(501, 2, 'Designer', 0)] })
        .mockResolvedValueOnce({ Items: [roleEffort(500, 1, 'Developer', 8), roleEffort(501, 2, 'Designer', 3)] }),
      updateRoleEffort: vi.fn().mockResolvedValue({ ok: true, data: null }),
      createRoleEffort: vi.fn(),
      getAssignableEffort: vi.fn().mockResolvedValue({ Id: 145789, Name: 'Story', Effort: 11 }),
    } as unknown as TpClient

    const result = await handleSetRoleEffort(mockTp, {
      entityId: '145789',
      efforts: [{ roleId: '1', effort: 8 }, { roleId: '2', effort: 3 }],
    })

    expect(mockTp.updateRoleEffort).toHaveBeenNthCalledWith(1, '500', 8)
    expect(mockTp.updateRoleEffort).toHaveBeenNthCalledWith(2, '501', 3)
    expect(mockTp.createRoleEffort).not.toHaveBeenCalled()
    expect(result.isError).toBeUndefined()
    const payload = JSON.parse(result.content[0].text)
    expect(payload.applied).toEqual([
      { roleId: 1, roleName: 'Developer', effort: 8, created: false },
      { roleId: 2, roleName: 'Designer', effort: 3, created: false },
    ])
    expect(payload.totalEffort).toBe(11)
    expect(payload.roleEfforts).toEqual([
      { roleEffortId: 500, roleId: 1, roleName: 'Developer', effort: 8 },
      { roleEffortId: 501, roleId: 2, roleName: 'Designer', effort: 3 },
    ])
  })

  it('creates a row when the card has no effort for that role yet', async () => {
    const mockTp = {
      getRoleEfforts: vi.fn()
        .mockResolvedValueOnce({ Items: [roleEffort(500, 1, 'Developer', 0)] })
        .mockResolvedValueOnce({ Items: [roleEffort(500, 1, 'Developer', 0), roleEffort(502, 3, 'QA', 5)] }),
      updateRoleEffort: vi.fn(),
      createRoleEffort: vi.fn().mockResolvedValue({ ok: true, data: { Role: { Name: 'QA' } } }),
      getAssignableEffort: vi.fn().mockResolvedValue({ Id: 145789, Name: 'Story', Effort: 5 }),
    } as unknown as TpClient

    const result = await handleSetRoleEffort(mockTp, {
      entityId: '145789',
      efforts: [{ roleId: '3', effort: 5 }],
    })

    expect(mockTp.createRoleEffort).toHaveBeenCalledWith('145789', '3', 5)
    expect(mockTp.updateRoleEffort).not.toHaveBeenCalled()
    expect(JSON.parse(result.content[0].text).applied).toEqual([
      { roleId: 3, roleName: 'QA', effort: 5, created: true },
    ])
  })

  it('clears a role estimate when the effort is zero', async () => {
    const mockTp = {
      getRoleEfforts: vi.fn()
        .mockResolvedValueOnce({ Items: [roleEffort(500, 1, 'Developer', 8)] })
        .mockResolvedValueOnce({ Items: [roleEffort(500, 1, 'Developer', 0)] }),
      updateRoleEffort: vi.fn().mockResolvedValue({ ok: true, data: null }),
      createRoleEffort: vi.fn(),
      getAssignableEffort: vi.fn().mockResolvedValue({ Id: 145789, Name: 'Story', Effort: 0 }),
    } as unknown as TpClient

    const result = await handleSetRoleEffort(mockTp, {
      entityId: '145789',
      efforts: [{ roleId: '1', effort: 0 }],
    })

    expect(mockTp.updateRoleEffort).toHaveBeenCalledWith('500', 0)
    expect(result.isError).toBeUndefined()
  })

  it('refuses to apply two efforts for the same role', async () => {
    const mockTp = {
      getRoleEfforts: vi.fn(),
      updateRoleEffort: vi.fn(),
      createRoleEffort: vi.fn(),
      getAssignableEffort: vi.fn(),
    } as unknown as TpClient

    const result = await handleSetRoleEffort(mockTp, {
      entityId: '145789',
      efforts: [{ roleId: '1', effort: 8 }, { roleId: '1', effort: 3 }],
    })

    expect(mockTp.getRoleEfforts).not.toHaveBeenCalled()
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain('Repeated role IDs: 1')
  })

  it('does not write anything when the current breakdown cannot be read', async () => {
    const mockTp = {
      getRoleEfforts: vi.fn().mockResolvedValue(new Error('boom')),
      updateRoleEffort: vi.fn(),
      createRoleEffort: vi.fn(),
      getAssignableEffort: vi.fn(),
    } as unknown as TpClient

    const result = await handleSetRoleEffort(mockTp, {
      entityId: '145789',
      efforts: [{ roleId: '1', effort: 8 }],
    })

    expect(mockTp.updateRoleEffort).not.toHaveBeenCalled()
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain('Failed to read the role effort breakdown')
  })

  it('surfaces TP errors and still applies the roles that succeeded', async () => {
    const mockTp = {
      getRoleEfforts: vi.fn()
        .mockResolvedValueOnce({ Items: [roleEffort(500, 1, 'Developer', 0), roleEffort(501, 2, 'Designer', 0)] })
        .mockResolvedValueOnce({ Items: [roleEffort(500, 1, 'Developer', 8), roleEffort(501, 2, 'Designer', 0)] }),
      updateRoleEffort: vi.fn()
        .mockResolvedValueOnce({ ok: true, data: null })
        .mockResolvedValueOnce({ ok: false, status: 400, body: 'role has no effort' }),
      createRoleEffort: vi.fn(),
      getAssignableEffort: vi.fn().mockResolvedValue({ Id: 145789, Name: 'Story', Effort: 8 }),
    } as unknown as TpClient

    const result = await handleSetRoleEffort(mockTp, {
      entityId: '145789',
      efforts: [{ roleId: '1', effort: 8 }, { roleId: '2', effort: 3 }],
    })

    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain('role has no effort')
    const payload = JSON.parse(result.content[0].text.split('\n').slice(1).join('\n'))
    expect(payload.applied).toHaveLength(1)
    expect(payload.failed).toEqual([{ roleId: 2, effort: 3, status: 400, body: 'role has no effort' }])
  })

  it('reports an accepted write that TP did not persist', async () => {
    const mockTp = {
      getRoleEfforts: vi.fn()
        .mockResolvedValueOnce({ Items: [roleEffort(500, 1, 'Developer', 0)] })
        .mockResolvedValueOnce({ Items: [roleEffort(500, 1, 'Developer', 0)] }),
      updateRoleEffort: vi.fn().mockResolvedValue({ ok: true, data: null }),
      createRoleEffort: vi.fn(),
      getAssignableEffort: vi.fn().mockResolvedValue({ Id: 145789, Name: 'Story', Effort: 0 }),
    } as unknown as TpClient

    const result = await handleSetRoleEffort(mockTp, {
      entityId: '145789',
      efforts: [{ roleId: '1', effort: 8 }],
    })

    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain('Not every role effort was applied')
    const payload = JSON.parse(result.content[0].text.split('\n').slice(1).join('\n'))
    expect(payload.notPersisted).toEqual([
      { roleId: 1, roleName: 'Developer', effort: 8, created: false },
    ])
  })
})

describe('handleGetRoleEfforts', () => {
  it('returns the breakdown together with the computed total', async () => {
    const mockTp = {
      getRoleEfforts: vi.fn().mockResolvedValue({
        Items: [roleEffort(500, 1, 'Developer', 8), roleEffort(501, 2, 'Designer', 3)],
      }),
      getAssignableEffort: vi.fn().mockResolvedValue({ Id: 145789, Name: 'Story', Effort: 11 }),
    } as unknown as TpClient

    const result = await handleGetRoleEfforts(mockTp, '145789')

    expect(JSON.parse(result.content[0].text)).toEqual({
      entityId: 145789,
      name: 'Story',
      totalEffort: 11,
      roleEfforts: [
        { roleEffortId: 500, roleId: 1, roleName: 'Developer', effort: 8 },
        { roleEffortId: 501, roleId: 2, roleName: 'Designer', effort: 3 },
      ],
    })
  })

  it('reports a failed total lookup', async () => {
    const mockTp = {
      getRoleEfforts: vi.fn().mockResolvedValue({ Items: [] }),
      getAssignableEffort: vi.fn().mockResolvedValue(new Error('boom')),
    } as unknown as TpClient

    const result = await handleGetRoleEfforts(mockTp, '145789')

    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain('Failed to read the total effort')
  })
})
