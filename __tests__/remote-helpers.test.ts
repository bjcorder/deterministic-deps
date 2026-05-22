import {
  githubApiBaseUrl,
  githubCommitApiUrl,
  githubServerUrl,
  githubTokenDecision,
  isTrustedGithubApiBaseUrl
} from '../src/remote'

function withEnv<T>(overrides: Record<string, string | undefined>, fn: () => T): T {
  const previous: Record<string, string | undefined> = {}
  for (const key of Object.keys(overrides)) {
    previous[key] = process.env[key]
    if (overrides[key] === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = overrides[key]
    }
  }
  try {
    return fn()
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = value
      }
    }
  }
}

describe('githubCommitApiUrl', () => {
  it('builds a /repos/owner/repo/commits/<sha> URL with the owner and repo URL-encoded', () => {
    expect(
      githubCommitApiUrl(
        'https://api.github.com',
        'octo cat',
        'hello/world',
        '1234567890abcdef1234567890abcdef12345678'
      )
    ).toBe(
      'https://api.github.com/repos/octo%20cat/hello%2Fworld/commits/1234567890abcdef1234567890abcdef12345678'
    )
  })
})

describe('githubServerUrl', () => {
  it('uses GITHUB_SERVER_URL when set', () => {
    const url = withEnv({ GITHUB_SERVER_URL: 'https://ghes.example.com' }, () => githubServerUrl())
    expect(url.host).toBe('ghes.example.com')
  })

  it('falls back to https://github.com when GITHUB_SERVER_URL is absent', () => {
    const url = withEnv({ GITHUB_SERVER_URL: undefined }, () => githubServerUrl())
    expect(url.host).toBe('github.com')
  })

  it('falls back to https://github.com when GITHUB_SERVER_URL is malformed', () => {
    const url = withEnv({ GITHUB_SERVER_URL: 'not a valid url' }, () => githubServerUrl())
    expect(url.host).toBe('github.com')
  })
})

describe('githubApiBaseUrl', () => {
  it('prefers GITHUB_API_URL when set and trims trailing slashes', () => {
    const base = withEnv({ GITHUB_API_URL: 'https://api.example.com///' }, () => githubApiBaseUrl())
    expect(base).toBe('https://api.example.com')
  })

  it('uses api.github.com for dot-com when no API URL is set', () => {
    const base = withEnv(
      { GITHUB_API_URL: undefined, GITHUB_SERVER_URL: 'https://github.com' },
      () => githubApiBaseUrl()
    )
    expect(base).toBe('https://api.github.com')
  })

  it('derives a /api/v3 URL for GitHub Enterprise Server when no API URL is set', () => {
    const base = withEnv(
      { GITHUB_API_URL: undefined, GITHUB_SERVER_URL: 'https://ghes.example.com' },
      () => githubApiBaseUrl()
    )
    expect(base).toBe('https://ghes.example.com/api/v3')
  })
})

describe('isTrustedGithubApiBaseUrl', () => {
  it('rejects non-HTTPS base URLs', () => {
    const trusted = withEnv({ GITHUB_SERVER_URL: 'https://github.com' }, () =>
      isTrustedGithubApiBaseUrl('http://api.github.com')
    )
    expect(trusted).toBe(false)
  })

  it('accepts api.github.com on dot-com', () => {
    const trusted = withEnv({ GITHUB_SERVER_URL: 'https://github.com' }, () =>
      isTrustedGithubApiBaseUrl('https://api.github.com')
    )
    expect(trusted).toBe(true)
  })

  it('rejects api.github.com when the configured server is GHES', () => {
    const trusted = withEnv({ GITHUB_SERVER_URL: 'https://ghes.example.com' }, () =>
      isTrustedGithubApiBaseUrl('https://api.github.com')
    )
    expect(trusted).toBe(false)
  })

  it('accepts the GHES host when it matches GITHUB_SERVER_URL', () => {
    const trusted = withEnv({ GITHUB_SERVER_URL: 'https://ghes.example.com' }, () =>
      isTrustedGithubApiBaseUrl('https://ghes.example.com/api/v3')
    )
    expect(trusted).toBe(true)
  })

  it('rejects a malformed base URL', () => {
    expect(isTrustedGithubApiBaseUrl('not a url')).toBe(false)
  })
})

describe('githubTokenDecision', () => {
  const baseHeaders = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'deterministic-deps'
  }

  it('omits the Authorization header when GITHUB_TOKEN is not set', () => {
    const decision = withEnv(
      { GITHUB_TOKEN: undefined, GITHUB_SERVER_URL: 'https://github.com' },
      () => githubTokenDecision('https://api.github.com', {})
    )

    expect(decision.headers).toEqual(baseHeaders)
    expect(decision.diagnostics).toEqual([])
  })

  it('omits the Authorization header when the policy is never, even if a token is set', () => {
    const decision = withEnv(
      { GITHUB_TOKEN: 'ghp_token', GITHUB_SERVER_URL: 'https://github.com' },
      () => githubTokenDecision('https://api.github.com', { remoteTokenPolicy: 'never' })
    )

    expect(decision.headers.Authorization).toBeUndefined()
    expect(decision.diagnostics).toEqual([])
  })

  it('attaches the Authorization header when the API URL is trusted', () => {
    const decision = withEnv(
      { GITHUB_TOKEN: 'ghp_token', GITHUB_SERVER_URL: 'https://github.com' },
      () => githubTokenDecision('https://api.github.com', {})
    )

    expect(decision.headers.Authorization).toBe('Bearer ghp_token')
    expect(decision.diagnostics).toEqual([])
  })

  it('withholds the token and emits a diagnostic when the API URL is untrusted', () => {
    const decision = withEnv(
      { GITHUB_TOKEN: 'ghp_token', GITHUB_SERVER_URL: 'https://github.com' },
      () => githubTokenDecision('https://attacker.example.com', {})
    )

    expect(decision.headers.Authorization).toBeUndefined()
    expect(decision.diagnostics).toHaveLength(1)
    expect(decision.diagnostics[0].message).toMatch(/omitted GITHUB_TOKEN for untrusted/)
  })
})
