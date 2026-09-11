import { afterEach, describe, expect, it, vi } from 'vitest'

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
    json: async () => ({ Id: 36193 }),
  })
  vi.stubGlobal('fetch', fetchMock)
  vi.spyOn(console, 'error').mockImplementation(() => { })
  return fetchMock
}

function requestBody(fetchMock: ReturnType<typeof vi.fn>) {
  const options = fetchMock.mock.calls[0][1] as RequestInit
  return JSON.parse(String(options.body))
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('updateUserStory effort', () => {
  it('includes a supplied effort estimate', async () => {
    const tp = await loadClient()
    const fetchMock = stubSuccessfulUpdate()

    await tp.updateUserStory({ id: '36193', effort: 8 })

    expect(requestBody(fetchMock)).toEqual({ Id: '36193', Effort: 8 })
  })

  it('includes zero so an estimate can be cleared', async () => {
    const tp = await loadClient()
    const fetchMock = stubSuccessfulUpdate()

    await tp.updateUserStory({ id: '36193', effort: 0 })

    expect(requestBody(fetchMock)).toEqual({ Id: '36193', Effort: 0 })
  })

  it('does not change effort when it is omitted', async () => {
    const tp = await loadClient()
    const fetchMock = stubSuccessfulUpdate()

    await tp.updateUserStory({ id: '36193', title: 'Updated title' })

    expect(requestBody(fetchMock)).toEqual({ Id: '36193', Name: 'Updated title' })
  })
})

describe('updateUserStoryCustomFields', () => {
  it('updates only the supported fields that are supplied', async () => {
    const tp = await loadClient()
    const fetchMock = stubSuccessfulUpdate()

    await tp.updateUserStoryCustomFields({
      id: '36194',
      backEnd: 'Doing',
      frontEnd: 'Done',
      figma: 'https://www.figma.com/design/example',
    })

    expect(requestBody(fetchMock)).toEqual({
      Id: '36194',
      customFields: [
        { name: 'BackEnd', type: 'DropDown', value: 'Doing' },
        { name: 'FrontEnd', type: 'DropDown', value: 'Done' },
        { name: 'Figma', type: 'URL', value: 'https://www.figma.com/design/example' },
      ],
    })
  })

  it('passes null to clear a supported custom field', async () => {
    const tp = await loadClient()
    const fetchMock = stubSuccessfulUpdate()

    await tp.updateUserStoryCustomFields({ id: '36194', figma: null })

    expect(requestBody(fetchMock)).toEqual({
      Id: '36194',
      customFields: [{ name: 'Figma', type: 'URL', value: null }],
    })
  })
})
