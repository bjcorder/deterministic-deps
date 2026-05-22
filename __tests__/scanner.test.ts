import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach } from '@jest/globals'
import { renderMarkdown, renderPatch, renderSarif } from '../src/report'
import { MAX_REMOTE_REFERENCES } from '../src/remote'
import { scan } from '../src/scanner'
import { shouldReportFailure } from '../src/rules'
import { Finding } from '../src/types'

const originalFetch = globalThis.fetch

function tempRepo(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'deterministic-deps-'))
}

function write(root: string, file: string, content: string): void {
  const target = path.join(root, file)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, content, 'utf8')
}

describe('deterministic-deps scanner', () => {
  afterEach(() => {
    globalThis.fetch = originalFetch
    delete process.env.GITHUB_TOKEN
    delete process.env.GITHUB_API_URL
    delete process.env.GITHUB_SERVER_URL
  })

  it('flags broad non-deterministic dependency declarations', async () => {
    const root = tempRepo()
    write(root, '.github/workflows/ci.yml', 'steps:\n  - uses: actions/checkout@v4\n')
    write(root, 'Dockerfile', 'FROM node:latest\n')
    write(
      root,
      'main.tf',
      'module "x" { source = "git::https://github.com/acme/mod.git?ref=main" }\n'
    )
    write(root, 'package.json', JSON.stringify({ dependencies: { leftpad: '^1.0.0' } }, null, 2))
    write(root, 'requirements.txt', 'examplepkg==2.32.0\n')
    write(root, 'go.mod', 'module example.com/app\n')
    write(root, 'Cargo.toml', '[dependencies]\nserde = "1"\n')
    write(
      root,
      'pom.xml',
      [
        '<project>',
        '  <dependencies>',
        '    <dependency>',
        '      <groupId>com.example</groupId>',
        '      <artifactId>dynamic</artifactId>',
        '      <version>1.0-SNAPSHOT</version>',
        '    </dependency>',
        '  </dependencies>',
        '</project>',
        ''
      ].join('\n')
    )
    write(
      root,
      'Gemfile',
      "gem 'rails', git: 'https://github.com/rails/rails.git', branch: 'main'\n"
    )

    const result = await scan({ root, include: [], exclude: [], config: {} })
    const ruleIds = result.findings.map((finding) => finding.ruleId)

    expect(ruleIds).toEqual(
      expect.arrayContaining([
        'github-actions/sha-pin',
        'containers/image-digest',
        'terraform/git-module-sha',
        'node/lockfile-required',
        'node/non-deterministic-spec',
        'python/hash-pinned-requirement',
        'go/sum-required',
        'rust/lockfile-required',
        'jvm/dynamic-version',
        'ruby/lockfile-required',
        'ruby/git-ref-sha'
      ])
    )
  })

  it('allows deterministic declarations with committed lockfiles or hashes', async () => {
    const root = tempRepo()
    const sha = '0123456789abcdef0123456789abcdef01234567'
    write(root, '.github/workflows/ci.yml', `steps:\n  - uses: actions/checkout@${sha}\n`)
    write(root, 'Dockerfile', `FROM node:24@sha256:${'a'.repeat(64)}\n`)
    write(
      root,
      'main.tf',
      `module "x" { source = "git::https://github.com/acme/mod.git?ref=${sha}" }\n`
    )
    write(root, '.terraform.lock.hcl', '# lock\n')
    write(root, 'package.json', JSON.stringify({ dependencies: { leftpad: '1.0.0' } }, null, 2))
    write(
      root,
      'package-lock.json',
      JSON.stringify(
        {
          lockfileVersion: 3,
          packages: {
            '': { dependencies: { leftpad: '1.0.0' } },
            'node_modules/leftpad': {
              version: '1.0.0',
              resolved: 'https://registry.npmjs.org/leftpad/-/leftpad-1.0.0.tgz',
              integrity: `sha512-${'a'.repeat(64)}`
            }
          }
        },
        null,
        2
      )
    )
    write(root, 'requirements.txt', `examplepkg==2.32.0 --hash=sha256:${'b'.repeat(64)}\n`)
    write(root, 'go.mod', 'module example.com/app\n')
    write(root, 'go.sum', 'example.com/module v1.0.0 h1:abc\n')
    write(root, 'Cargo.toml', '[dependencies]\nserde = "1"\n')
    write(root, 'Cargo.lock', '# lock\n')
    write(root, 'Gemfile', "gem 'rails'\n")
    write(root, 'Gemfile.lock', '# lock\n')

    const result = await scan({ root, include: [], exclude: [], config: {} })

    expect(result.findings).toEqual([])
  })

  it('supports allowlists, severity overrides, and enforce thresholds', async () => {
    const root = tempRepo()
    write(root, 'Dockerfile', 'FROM node:latest\n')

    const result = await scan({
      root,
      include: [],
      exclude: [],
      config: {
        severityOverrides: { 'containers/image-digest': 'low' },
        allowlist: []
      }
    })

    expect(result.findings).toHaveLength(1)
    expect(result.findings[0].severity).toBe('low')
    expect(shouldReportFailure(result.findings, 'medium')).toBe(false)
    expect(shouldReportFailure(result.findings, 'low')).toBe(true)

    const allowed = await scan({
      root,
      include: [],
      exclude: [],
      config: {
        allowlist: [{ file: 'Dockerfile', ruleId: 'containers/image-digest' }]
      }
    })
    expect(allowed.findings).toEqual([])
  })

  it('handles many dependency files while pruning nested default excludes', async () => {
    const root = tempRepo()

    for (let index = 0; index < 60; index += 1) {
      write(
        root,
        `services/service-${index}/Dockerfile`,
        `FROM alpine:3.20@sha256:${'a'.repeat(64)}\n`
      )
    }

    for (const ignoredDirectory of ['.git', 'node_modules', 'dist', 'target', '.terraform']) {
      write(
        root,
        `platform/${ignoredDirectory}/deeply/nested/package/Dockerfile`,
        'FROM alpine:latest\n'
      )
      write(
        root,
        `platform/${ignoredDirectory}/deeply/nested/package/package.json`,
        JSON.stringify({ dependencies: { leftpad: '^1.0.0' } }, null, 2)
      )
    }

    const result = await scan({ root, include: [], exclude: [], config: {} })

    expect(result.scannedFiles).toHaveLength(60)
    expect(result.scannedFiles).toEqual(
      Array.from({ length: 60 }, (_, index) => `services/service-${index}/Dockerfile`).sort()
    )
    expect(result.findings).toEqual([])
  })

  it('honors ecosystem-specific policy options', async () => {
    const root = tempRepo()
    write(root, 'package.json', JSON.stringify({ dependencies: { leftpad: '^1.0.0' } }, null, 2))
    write(
      root,
      'package-lock.json',
      JSON.stringify(
        {
          lockfileVersion: 3,
          packages: {
            '': { dependencies: { leftpad: '^1.0.0' } },
            'node_modules/leftpad': {
              version: '1.0.0',
              resolved: 'https://registry.npmjs.org/leftpad/-/leftpad-1.0.0.tgz',
              integrity: `sha512-${'a'.repeat(64)}`
            }
          }
        },
        null,
        2
      )
    )
    write(root, 'requirements.txt', 'examplepkg==2.32.0\n')
    write(root, 'pyproject.toml', '[project]\ndependencies = ["examplepkg"]\n')
    write(root, 'go.mod', 'module example.com/app\n')
    write(root, 'Cargo.toml', '[dependencies]\nserde = "1"\n')
    write(root, 'Gemfile', "gem 'rails'\n")
    write(
      root,
      'main.tf',
      [
        'terraform {',
        '  required_providers {',
        '    aws = {',
        '      source = "hashicorp/aws"',
        '      version = "~> 5.0"',
        '    }',
        '  }',
        '}',
        ''
      ].join('\n')
    )

    const result = await scan({
      root,
      include: [],
      exclude: [],
      config: {
        ecosystems: {
          go: { requireGoSum: false },
          node: { allowVersionRangesWithLockfile: true },
          python: {
            requireProjectLockfile: false,
            requireRequirementHashes: false
          },
          ruby: { requireLockfile: false },
          rust: { requireLockfile: false },
          terraform: { requireProviderLock: false }
        }
      }
    })

    expect(result.findings).toEqual([])
  })

  it('uses parsed workflow YAML so comments do not create action findings', async () => {
    const root = tempRepo()
    write(
      root,
      '.github/workflows/ci.yml',
      [
        'name: ci',
        'on: pull_request',
        'jobs:',
        '  test:',
        '    runs-on: ubuntu-24.04',
        '    steps:',
        '      # uses: actions/checkout@v4',
        '      - uses: ./local-action',
        '      - uses: docker://alpine:3.20',
        ''
      ].join('\n')
    )

    const result = await scan({ root, include: [], exclude: [], config: {} })

    expect(result.findings.map((finding) => finding.ruleId)).toEqual([
      'github-actions/docker-digest'
    ])
  })

  it('flags reusable workflow refs from parsed workflow jobs', async () => {
    const root = tempRepo()
    write(
      root,
      '.github/workflows/reuse.yml',
      [
        'jobs:',
        '  call:',
        '    uses: octo-org/automation/.github/workflows/release.yml@main',
        ''
      ].join('\n')
    )

    const result = await scan({ root, include: [], exclude: [], config: {} })

    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ruleId: 'github-actions/sha-pin',
          line: 3
        })
      ])
    )
  })

  it('uses parsed compose and devcontainer files for image references', async () => {
    const root = tempRepo()
    write(
      root,
      'docker-compose.yml',
      [
        'services:',
        '  app:',
        '    # image: redis:latest',
        '    image: ghcr.io/acme/app:1.0.0',
        '  worker:',
        `    image: ghcr.io/acme/worker:1.0.0@sha256:${'c'.repeat(64)}`,
        ''
      ].join('\n')
    )
    write(
      root,
      '.devcontainer/devcontainer.json',
      JSON.stringify({ image: 'mcr.microsoft.com/devcontainers/typescript-node:latest' }, null, 2)
    )

    const result = await scan({ root, include: [], exclude: [], config: {} })

    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ruleId: 'containers/image-digest',
          file: 'docker-compose.yml',
          line: 4,
          severity: 'medium'
        }),
        expect.objectContaining({
          ruleId: 'containers/image-digest',
          file: '.devcontainer/devcontainer.json',
          severity: 'high'
        })
      ])
    )
    expect(result.findings).toHaveLength(2)
  })

  it('keeps Terraform checks scoped to module and provider blocks', async () => {
    const root = tempRepo()
    write(
      root,
      'main.tf',
      [
        'variable "source" {',
        '  default = "git::https://github.com/acme/not-a-module.git?ref=main"',
        '}',
        '',
        'module "floating" {',
        '  source = "git::https://github.com/acme/module.git?ref=main"',
        '}',
        '',
        'terraform {',
        '  required_providers {',
        '    aws = {',
        '      source = "hashicorp/aws"',
        '      version = "~> 5.0"',
        '    }',
        '  }',
        '}',
        ''
      ].join('\n')
    )

    const result = await scan({ root, include: [], exclude: [], config: {} })

    expect(result.findings).toEqual([
      expect.objectContaining({
        ruleId: 'terraform/git-module-sha',
        line: 6
      }),
      expect.objectContaining({
        ruleId: 'terraform/provider-lock',
        line: 13
      })
    ])
  })

  it('renders markdown and sarif reports', async () => {
    const root = tempRepo()
    write(root, 'Dockerfile', 'FROM node:latest\n')
    const result = await scan({ root, include: [], exclude: [], config: {} })

    expect(renderMarkdown(result.findings)).toContain('containers/image-digest')
    expect(JSON.stringify(renderSarif(result.findings))).toContain('deterministic-deps')
  })

  it('does not perform remote validation by default', async () => {
    const root = tempRepo()
    const sha = '0123456789abcdef0123456789abcdef01234567'
    const fetchMock = jest.fn()
    globalThis.fetch = fetchMock
    write(root, '.github/workflows/ci.yml', `steps:\n  - uses: actions/checkout@${sha}\n`)

    const result = await scan({ root, include: [], exclude: [], config: {} })

    expect(fetchMock).not.toHaveBeenCalled()
    expect(result.findings).toEqual([])
  })

  it('passes when remote validation finds GitHub Action SHAs', async () => {
    const root = tempRepo()
    const sha = '0123456789abcdef0123456789abcdef01234567'
    const fetchMock = jest.fn().mockResolvedValue({ status: 200 })
    globalThis.fetch = fetchMock
    write(root, '.github/workflows/ci.yml', `steps:\n  - uses: actions/checkout@${sha}\n`)

    const result = await scan({
      root,
      include: [],
      exclude: [],
      config: { remoteValidation: true, remoteValidationRetries: 0 }
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe(
      `https://api.github.com/repos/actions/checkout/commits/${sha}`
    )
    expect(result.findings).toEqual([])
  })

  it('sends GITHUB_TOKEN to trusted GitHub.com API URLs in auto mode', async () => {
    const root = tempRepo()
    const sha = '0123456789abcdef0123456789abcdef01234567'
    const fetchMock = jest.fn().mockResolvedValue({ status: 200 })
    globalThis.fetch = fetchMock
    process.env.GITHUB_TOKEN = 'github-token'
    write(root, '.github/workflows/ci.yml', `steps:\n  - uses: actions/checkout@${sha}\n`)

    const result = await scan({
      root,
      include: [],
      exclude: [],
      config: { remoteValidation: true, remoteValidationRetries: 0 }
    })

    expect(fetchMock).toHaveBeenCalledWith(
      `https://api.github.com/repos/actions/checkout/commits/${sha}`,
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({ Authorization: 'Bearer github-token' })
      })
    )
    expect(result.findings).toEqual([])
    expect(result.diagnostics).toEqual([])
  })

  it('omits GITHUB_TOKEN in never mode', async () => {
    const root = tempRepo()
    const sha = '0123456789abcdef0123456789abcdef01234567'
    const fetchMock = jest.fn().mockResolvedValue({ status: 200 })
    globalThis.fetch = fetchMock
    process.env.GITHUB_TOKEN = 'github-token'
    write(root, '.github/workflows/ci.yml', `steps:\n  - uses: actions/checkout@${sha}\n`)

    const result = await scan({
      root,
      include: [],
      exclude: [],
      config: {
        remoteValidation: true,
        remoteTokenPolicy: 'never',
        remoteValidationRetries: 0
      }
    })

    expect(fetchMock).toHaveBeenCalledWith(
      `https://api.github.com/repos/actions/checkout/commits/${sha}`,
      expect.objectContaining({
        method: 'GET',
        headers: expect.not.objectContaining({ Authorization: expect.any(String) })
      })
    )
    expect(result.findings).toEqual([])
    expect(result.diagnostics).toEqual([])
  })

  it('sends GITHUB_TOKEN to matching HTTPS GitHub Enterprise API hosts in auto mode', async () => {
    const root = tempRepo()
    const sha = '0123456789abcdef0123456789abcdef01234567'
    const fetchMock = jest.fn().mockResolvedValue({ status: 200 })
    globalThis.fetch = fetchMock
    process.env.GITHUB_TOKEN = 'ghe-token'
    process.env.GITHUB_SERVER_URL = 'https://ghe.example.com:8443'
    process.env.GITHUB_API_URL = 'https://ghe.example.com:8443/api/v3/'
    write(root, '.github/workflows/ci.yml', `steps:\n  - uses: platform/checkout@${sha}\n`)

    const result = await scan({
      root,
      include: [],
      exclude: [],
      config: { remoteValidation: true, remoteValidationRetries: 0 }
    })

    expect(fetchMock).toHaveBeenCalledWith(
      `https://ghe.example.com:8443/api/v3/repos/platform/checkout/commits/${sha}`,
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({ Authorization: 'Bearer ghe-token' })
      })
    )
    expect(result.findings).toEqual([])
    expect(result.diagnostics).toEqual([])
  })

  it('omits GITHUB_TOKEN and warns for mismatched GitHub Enterprise API hosts in auto mode', async () => {
    const root = tempRepo()
    const sha = '0123456789abcdef0123456789abcdef01234567'
    const fetchMock = jest.fn().mockResolvedValue({ status: 200 })
    globalThis.fetch = fetchMock
    process.env.GITHUB_TOKEN = 'ghe-token'
    process.env.GITHUB_SERVER_URL = 'https://ghe.example.com'
    process.env.GITHUB_API_URL = 'https://evil.example.com/api/v3'
    write(root, '.github/workflows/ci.yml', `steps:\n  - uses: platform/checkout@${sha}\n`)

    const result = await scan({
      root,
      include: [],
      exclude: [],
      config: { remoteValidation: true, remoteValidationRetries: 0 }
    })

    expect(fetchMock).toHaveBeenCalledWith(
      `https://evil.example.com/api/v3/repos/platform/checkout/commits/${sha}`,
      expect.objectContaining({
        method: 'GET',
        headers: expect.not.objectContaining({ Authorization: expect.any(String) })
      })
    )
    expect(result.findings).toEqual([])
    expect(result.diagnostics).toEqual([
      {
        message:
          "remote-token-policy auto omitted GITHUB_TOKEN for untrusted GitHub API URL 'https://evil.example.com/api/v3'. Expected HTTPS api.github.com for GitHub.com or an HTTPS host matching GITHUB_SERVER_URL for GitHub Enterprise Server."
      }
    ])
  })

  it('omits GITHUB_TOKEN and warns for non-HTTPS API URLs in auto mode', async () => {
    const root = tempRepo()
    const sha = '0123456789abcdef0123456789abcdef01234567'
    const fetchMock = jest.fn().mockResolvedValue({ status: 200 })
    globalThis.fetch = fetchMock
    process.env.GITHUB_TOKEN = 'github-token'
    process.env.GITHUB_API_URL = 'http://api.github.com'
    write(root, '.github/workflows/ci.yml', `steps:\n  - uses: actions/checkout@${sha}\n`)

    const result = await scan({
      root,
      include: [],
      exclude: [],
      config: { remoteValidation: true, remoteValidationRetries: 0 }
    })

    expect(fetchMock).toHaveBeenCalledWith(
      `http://api.github.com/repos/actions/checkout/commits/${sha}`,
      expect.objectContaining({
        method: 'GET',
        headers: expect.not.objectContaining({ Authorization: expect.any(String) })
      })
    )
    expect(result.findings).toEqual([])
    expect(result.diagnostics).toEqual([
      {
        message:
          "remote-token-policy auto omitted GITHUB_TOKEN for untrusted GitHub API URL 'http://api.github.com'. Expected HTTPS api.github.com for GitHub.com or an HTTPS host matching GITHUB_SERVER_URL for GitHub Enterprise Server."
      }
    ])
  })

  it('omits Authorization without warning when GITHUB_TOKEN is absent', async () => {
    const root = tempRepo()
    const sha = '0123456789abcdef0123456789abcdef01234567'
    const fetchMock = jest.fn().mockResolvedValue({ status: 200 })
    globalThis.fetch = fetchMock
    write(root, '.github/workflows/ci.yml', `steps:\n  - uses: actions/checkout@${sha}\n`)

    const result = await scan({
      root,
      include: [],
      exclude: [],
      config: { remoteValidation: true, remoteValidationRetries: 0 }
    })

    expect(fetchMock).toHaveBeenCalledWith(
      `https://api.github.com/repos/actions/checkout/commits/${sha}`,
      expect.objectContaining({
        method: 'GET',
        headers: expect.not.objectContaining({ Authorization: expect.any(String) })
      })
    )
    expect(result.findings).toEqual([])
    expect(result.diagnostics).toEqual([])
  })

  it('reports missing GitHub Action SHAs when remote validation is enabled', async () => {
    const root = tempRepo()
    const sha = 'ffffffffffffffffffffffffffffffffffffffff'
    globalThis.fetch = jest.fn().mockResolvedValue({ status: 404 })
    write(root, '.github/workflows/ci.yml', `steps:\n  - uses: actions/checkout@${sha}\n`)

    const result = await scan({
      root,
      include: [],
      exclude: [],
      config: { remoteValidation: true, remoteValidationRetries: 0 }
    })

    expect(result.findings).toEqual([
      expect.objectContaining({
        ruleId: 'remote/github-ref',
        ecosystem: 'remote',
        severity: 'high',
        file: '.github/workflows/ci.yml',
        line: 2
      })
    ])
  })

  it('reports deterministic remote validation errors for rate limits', async () => {
    const root = tempRepo()
    const sha = '0123456789abcdef0123456789abcdef01234567'
    globalThis.fetch = jest.fn().mockResolvedValue({ status: 403 })
    write(root, '.github/workflows/ci.yml', `steps:\n  - uses: actions/checkout@${sha}\n`)

    const result = await scan({
      root,
      include: [],
      exclude: [],
      config: { remoteValidation: true, remoteValidationRetries: 0 }
    })

    expect(result.findings).toEqual([
      expect.objectContaining({
        ruleId: 'remote/validation-error',
        ecosystem: 'remote',
        severity: 'low'
      })
    ])
    expect(result.findings[0].message).toContain('GitHub API returned 403')
  })

  it('reports deterministic remote validation errors for network failures', async () => {
    const root = tempRepo()
    const sha = '0123456789abcdef0123456789abcdef01234567'
    globalThis.fetch = jest.fn().mockRejectedValue(new Error('socket failed'))
    write(root, '.github/workflows/ci.yml', `steps:\n  - uses: actions/checkout@${sha}\n`)

    const result = await scan({
      root,
      include: [],
      exclude: [],
      config: { remoteValidation: true, remoteValidationRetries: 0 }
    })

    expect(result.findings).toEqual([
      expect.objectContaining({
        ruleId: 'remote/validation-error',
        ecosystem: 'remote',
        severity: 'low'
      })
    ])
    expect(result.findings[0].message).toContain('socket failed')
    expect(result.findings[0].message).not.toContain('Error:')
  })

  it('caps remote validation fan-out without silently skipping overflow refs', async () => {
    const root = tempRepo()
    const fetchMock = jest.fn().mockResolvedValue({ status: 200 })
    globalThis.fetch = fetchMock
    const totalReferences = MAX_REMOTE_REFERENCES + 20
    const lines = ['steps:']
    for (let index = 0; index < totalReferences; index += 1) {
      const sha = index.toString(16).padStart(40, '0')
      lines.push(`  - uses: actions/checkout@${sha}`)
    }
    write(root, '.github/workflows/ci.yml', `${lines.join('\n')}\n`)

    const result = await scan({
      root,
      include: [],
      exclude: [],
      config: { remoteValidation: true, remoteValidationRetries: 0 }
    })

    expect(fetchMock).toHaveBeenCalledTimes(MAX_REMOTE_REFERENCES)
    expect(result.findings).toHaveLength(20)
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ruleId: 'remote/validation-error',
          ecosystem: 'remote',
          severity: 'low',
          message: expect.stringContaining(
            'was skipped because the scan reached the 100 unique remote reference limit'
          )
        })
      ])
    )
    expect(shouldReportFailure(result.findings, 'low')).toBe(true)
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message:
            'Remote validation limited to 100 unique remote references (from 120) to protect CI runtime and API quotas.'
        })
      ])
    )
  })

  it('does not count duplicate remote references against the fan-out cap', async () => {
    const root = tempRepo()
    const fetchMock = jest.fn().mockResolvedValue({ status: 200 })
    globalThis.fetch = fetchMock
    const lines = ['steps:']
    for (let index = 0; index < MAX_REMOTE_REFERENCES; index += 1) {
      const sha = index.toString(16).padStart(40, '0')
      lines.push(`  - uses: actions/checkout@${sha}`)
    }
    lines.push('  - uses: actions/checkout@0000000000000000000000000000000000000000')
    write(root, '.github/workflows/ci.yml', `${lines.join('\n')}\n`)

    const result = await scan({
      root,
      include: [],
      exclude: [],
      config: { remoteValidation: true, remoteValidationRetries: 0 }
    })

    expect(fetchMock).toHaveBeenCalledTimes(MAX_REMOTE_REFERENCES)
    expect(result.findings).toEqual([])
    expect(result.diagnostics).toEqual([])
  })

  it('validates GitHub-hosted git dependency commit refs when enabled', async () => {
    const root = tempRepo()
    const sha = '0123456789abcdef0123456789abcdef01234567'
    const fetchMock = jest.fn().mockResolvedValue({ status: 200 })
    globalThis.fetch = fetchMock
    write(root, 'requirements.txt', `example @ git+https://github.com/example/project.git@${sha}\n`)

    const result = await scan({
      root,
      include: [],
      exclude: [],
      config: { remoteValidation: true, remoteValidationRetries: 0 }
    })

    expect(fetchMock).toHaveBeenCalledWith(
      `https://api.github.com/repos/example/project/commits/${sha}`,
      expect.objectContaining({ method: 'GET' })
    )
    expect(result.findings).toEqual([])
  })

  it('uses GitHub Enterprise API endpoints for action refs when configured', async () => {
    const root = tempRepo()
    const sha = '0123456789abcdef0123456789abcdef01234567'
    const fetchMock = jest.fn().mockResolvedValue({ status: 200 })
    globalThis.fetch = fetchMock
    process.env.GITHUB_SERVER_URL = 'https://ghe.example.com'
    process.env.GITHUB_API_URL = 'https://ghe.example.com/api/v3'
    write(root, '.github/workflows/ci.yml', `steps:\n  - uses: platform/checkout@${sha}\n`)

    const result = await scan({
      root,
      include: [],
      exclude: [],
      config: { remoteValidation: true, remoteValidationRetries: 0 }
    })

    expect(fetchMock).toHaveBeenCalledWith(
      `https://ghe.example.com/api/v3/repos/platform/checkout/commits/${sha}`,
      expect.objectContaining({ method: 'GET' })
    )
    expect(result.findings).toEqual([])
  })

  it('validates GitHub Enterprise git dependency URLs for the configured server', async () => {
    const root = tempRepo()
    const sha = '0123456789abcdef0123456789abcdef01234567'
    const fetchMock = jest.fn().mockResolvedValue({ status: 200 })
    globalThis.fetch = fetchMock
    process.env.GITHUB_SERVER_URL = 'https://ghe.example.com'
    process.env.GITHUB_API_URL = 'https://ghe.example.com/api/v3/'
    write(
      root,
      'requirements.txt',
      `example @ git+https://ghe.example.com/team/project.git@${sha}\n`
    )

    const result = await scan({
      root,
      include: [],
      exclude: [],
      config: { remoteValidation: true, remoteValidationRetries: 0 }
    })

    expect(fetchMock).toHaveBeenCalledWith(
      `https://ghe.example.com/api/v3/repos/team/project/commits/${sha}`,
      expect.objectContaining({ method: 'GET' })
    )
    expect(result.findings).toEqual([])
  })

  it('matches GitHub Enterprise git dependency URLs on configured nonstandard ports', async () => {
    const root = tempRepo()
    const sha = '0123456789abcdef0123456789abcdef01234567'
    const fetchMock = jest.fn().mockResolvedValue({ status: 200 })
    globalThis.fetch = fetchMock
    process.env.GITHUB_SERVER_URL = 'https://ghe.example.com:8443'
    write(
      root,
      'requirements.txt',
      `example @ git+https://ghe.example.com:8443/team/project.git@${sha}\n`
    )

    const result = await scan({
      root,
      include: [],
      exclude: [],
      config: { remoteValidation: true, remoteValidationRetries: 0 }
    })

    expect(fetchMock).toHaveBeenCalledWith(
      `https://ghe.example.com:8443/api/v3/repos/team/project/commits/${sha}`,
      expect.objectContaining({ method: 'GET' })
    )
    expect(result.findings).toEqual([])
  })

  it('adds safe remediation suggestions when an immutable replacement is already present', async () => {
    const root = tempRepo()
    const sha = '0123456789abcdef0123456789abcdef01234567'
    write(
      root,
      'Cargo.toml',
      ['[dependencies]', `demo = { git = "https://github.com/acme/demo.git?rev=${sha}" }`, ''].join(
        '\n'
      )
    )
    write(root, 'Cargo.lock', '# lock\n')

    const result = await scan({ root, include: [], exclude: [], config: {} })

    expect(result.findings).toEqual([
      expect.objectContaining({
        ruleId: 'rust/git-rev-sha',
        suggestion: expect.objectContaining({
          safeToApply: true,
          confidence: 'high',
          replacement: expect.objectContaining({
            line: 2,
            newText: `demo = { git = "https://github.com/acme/demo.git?rev=${sha}", rev = "${sha}" }`
          })
        })
      })
    ])
  })

  it('redacts credential material from stored findings across dependency ecosystems', async () => {
    const root = tempRepo()
    write(
      root,
      '.github/workflows/ci.yml',
      [
        'jobs:',
        '  test:',
        '    runs-on: ubuntu-24.04',
        '    steps:',
        '      - uses: docker://user:supersecret@registry.example.com/acme/app:latest',
        ''
      ].join('\n')
    )
    write(root, 'Dockerfile', 'FROM user:supersecret@registry.example.com/acme/app:latest\n')
    write(
      root,
      'package.json',
      JSON.stringify(
        {
          dependencies: {
            demo: 'git+https://user:supersecret@example.com/acme/demo.git#main'
          }
        },
        null,
        2
      )
    )
    write(
      root,
      'requirements.txt',
      'demo @ git+https://user:supersecret@example.com/acme/demo.git@main\n'
    )
    write(
      root,
      'Gemfile',
      "gem 'demo', git: 'https://user:supersecret@example.com/acme/demo.git', branch: 'main'\n"
    )
    write(root, 'Gemfile.lock', '# lock\n')

    const result = await scan({ root, include: [], exclude: [], config: {} })
    const serialized = JSON.stringify(result.findings)

    expect(serialized).not.toContain('supersecret')
    expect(serialized).toContain('[REDACTED]')
    expect(result.findings.map((finding) => finding.ruleId)).toEqual(
      expect.arrayContaining([
        'github-actions/docker-digest',
        'containers/image-digest',
        'node/non-deterministic-spec',
        'python/git-sha',
        'ruby/git-ref-sha'
      ])
    )
  })

  it('redacts credential material from remote validation findings', async () => {
    const root = tempRepo()
    const sha = 'ffffffffffffffffffffffffffffffffffffffff'
    globalThis.fetch = jest.fn().mockResolvedValue({ status: 404 })
    write(
      root,
      'requirements.txt',
      `demo @ git+https://github.com/acme/demo.git?private_token=supersecret&ref=${sha}\n`
    )

    const result = await scan({
      root,
      include: [],
      exclude: [],
      config: { remoteValidation: true, remoteValidationRetries: 0 }
    })

    expect(JSON.stringify(result.findings)).not.toContain('supersecret')
    expect(JSON.stringify(result.findings)).toContain('private_token=[REDACTED]')
    expect(result.findings).toEqual([
      expect.objectContaining({
        ruleId: 'remote/github-ref'
      })
    ])
  })

  it('redacts credential material from stored replacement suggestions', async () => {
    const root = tempRepo()
    const sha = '0123456789abcdef0123456789abcdef01234567'
    write(
      root,
      'Cargo.toml',
      [
        '[dependencies]',
        `demo = { git = "https://user:supersecret@github.com/acme/demo.git?private_token=querysecret&rev=${sha}" }`,
        ''
      ].join('\n')
    )
    write(root, 'Cargo.lock', '# lock\n')

    const result = await scan({ root, include: [], exclude: [], config: {} })
    const serialized = JSON.stringify(result.findings)
    const finding = result.findings.find((entry) => entry.ruleId === 'rust/git-rev-sha')

    expect(serialized).not.toContain('supersecret')
    expect(serialized).not.toContain('querysecret')
    expect(serialized).toContain('[REDACTED]')
    expect(finding?.suggestion).toEqual(
      expect.objectContaining({
        safeToApply: false,
        replacement: expect.objectContaining({
          oldText: expect.stringContaining('[REDACTED]'),
          newText: expect.stringContaining('[REDACTED]')
        })
      })
    )

    const markdown = renderMarkdown(result.findings)
    const sarif = JSON.stringify(renderSarif(result.findings))
    const patch = renderPatch(root, result.findings)

    expect(markdown).not.toContain('Replace line 2 with')
    expect(markdown).not.toContain('supersecret')
    expect(markdown).not.toContain('querysecret')
    expect(sarif).not.toContain('"fixes"')
    expect(sarif).not.toContain('supersecret')
    expect(sarif).not.toContain('querysecret')
    expect(patch).toBe('')
  })

  it('redacts reports and skips patch or SARIF fixes for credential-bearing replacements', () => {
    const root = tempRepo()
    const sha = '0123456789abcdef0123456789abcdef01234567'
    const oldText = `demo = { git = "https://user:supersecret@github.com/acme/demo.git?rev=${sha}" }`
    const newText = oldText.replace(/\s*}\s*$/, `, rev = "${sha}" }`)
    write(root, 'Cargo.toml', ['[dependencies]', oldText, ''].join('\n'))

    const findings: Finding[] = [
      {
        ruleId: 'rust/git-rev-sha',
        ecosystem: 'rust',
        file: 'Cargo.toml',
        line: 2,
        severity: 'high',
        message: `Rust git dependency '${oldText}' does not pin a rev commit SHA.`,
        remediation: 'Add rev = "<40-character commit SHA>" to git dependencies.',
        suggestion: {
          title: `Add explicit Cargo rev '${sha}' from the existing git URL.`,
          confidence: 'high',
          safeToApply: true,
          replacement: {
            file: 'Cargo.toml',
            line: 2,
            oldText,
            newText
          }
        }
      }
    ]

    const markdown = renderMarkdown(findings)
    const sarif = JSON.stringify(renderSarif(findings))
    const patch = renderPatch(root, findings)

    expect(markdown).not.toContain('supersecret')
    expect(markdown).not.toContain('Replace line 2 with')
    expect(markdown).toContain('[REDACTED]')
    expect(sarif).not.toContain('supersecret')
    expect(sarif).not.toContain('"fixes"')
    expect(sarif).toContain('[REDACTED]')
    expect(patch).toBe('')
  })
})
