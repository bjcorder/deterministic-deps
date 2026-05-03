import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach } from '@jest/globals'
import { renderMarkdown, renderSarif } from '../src/report'
import { scan } from '../src/scanner'
import { shouldReportFailure } from '../src/rules'

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
    write(root, 'requirements.txt', 'requests==2.32.0\n')
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
    write(root, 'requirements.txt', `requests==2.32.0 --hash=sha256:${'b'.repeat(64)}\n`)
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
    write(root, 'requirements.txt', 'requests==2.32.0\n')
    write(root, 'pyproject.toml', '[project]\ndependencies = ["requests"]\n')
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
        '    runs-on: ubuntu-latest',
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
})
