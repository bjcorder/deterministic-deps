import fs from 'node:fs'
import path from 'node:path'
import { clearTimeout, setTimeout } from 'node:timers'
import { setTimeout as sleepTimeout } from 'node:timers/promises'
import yaml from 'js-yaml'
import { SHA_PATTERN } from './constants'
import { Config, Finding } from './types'

interface RemoteReference {
  host: string
  owner: string
  repo: string
  sha: string
  file: string
  line: number
  reference: string
}

type ValidationResult =
  | { status: 'found' }
  | { status: 'missing' }
  | { status: 'error'; message: string }

const DEFAULT_TIMEOUT_MS = 5000
const DEFAULT_RETRIES = 1

export async function validateRemoteReferences(
  root: string,
  files: string[],
  config: Config
): Promise<Finding[]> {
  const references = dedupeRemoteReferences(
    files.flatMap((file) => collectRemoteReferences(root, file))
  )
  const cache = new Map<string, ValidationResult>()
  const findings: Finding[] = []

  for (const reference of references) {
    const key =
      `${reference.host}/${reference.owner}/${reference.repo}@${reference.sha}`.toLowerCase()
    let result = cache.get(key)
    if (!result) {
      result = await validateGithubCommit(reference.owner, reference.repo, reference.sha, config)
      cache.set(key, result)
    }

    if (result.status === 'missing') {
      findings.push(
        remoteFinding(
          'remote/github-ref',
          reference,
          'high',
          `GitHub commit '${reference.sha}' for '${reference.owner}/${reference.repo}' could not be found.`,
          'Confirm the repository and commit SHA, or update the reference to an existing immutable commit.'
        )
      )
    } else if (result.status === 'error') {
      findings.push(
        remoteFinding(
          'remote/validation-error',
          reference,
          'low',
          `Remote validation for '${reference.owner}/${reference.repo}@${reference.sha}' could not complete: ${result.message}.`,
          'Retry later, adjust remote validation timeout/retry settings, or disable remote validation for offline/static-only runs.'
        )
      )
    }
  }

  return findings
}

function collectRemoteReferences(root: string, file: string): RemoteReference[] {
  const absolutePath = path.join(root, file)
  const content = fs.readFileSync(absolutePath, 'utf8')
  const serverHost = githubServerHost()
  const references = collectGithubUrlCommitReferences(file, content, serverHost)

  if (/\.ya?ml$/i.test(file) && isWorkflowOrActionFile(file)) {
    references.push(...collectGithubActionCommitReferences(file, content, serverHost))
  }

  return references
}

function collectGithubActionCommitReferences(
  file: string,
  content: string,
  host: string
): RemoteReference[] {
  const lines = content.split(/\r?\n/)
  const references = parseYamlDocuments(content).flatMap((document) =>
    collectStringProperties(document, 'uses')
  )

  return references.flatMap((reference) => {
    if (
      reference.startsWith('./') ||
      reference.startsWith('../') ||
      reference.startsWith('docker://')
    ) {
      return []
    }

    const atIndex = reference.lastIndexOf('@')
    if (atIndex === -1) {
      return []
    }

    const sha = reference.slice(atIndex + 1)
    if (!SHA_PATTERN.test(sha)) {
      return []
    }

    const parts = reference.slice(0, atIndex).split('/')
    if (parts.length < 2) {
      return []
    }

    return [
      {
        host,
        owner: parts[0],
        repo: parts[1],
        sha,
        file,
        line: lineForYamlScalar(lines, 'uses', reference),
        reference
      }
    ]
  })
}

function collectGithubUrlCommitReferences(
  file: string,
  content: string,
  host: string
): RemoteReference[] {
  const references: RemoteReference[] = []
  const pattern = new RegExp(
    `${escapeRegExp(host)}[:/]([A-Za-z0-9_.-]+)\\/([A-Za-z0-9_.-]+?)(?:\\.git)?(?=[/#?@])(?:[^\\s'"<>)]{0,200})?(?:[?#&]ref=|#|@)([a-f0-9]{40})`,
    'gi'
  )

  for (const match of content.matchAll(pattern)) {
    const index = match.index ?? 0
    references.push({
      host,
      owner: match[1],
      repo: match[2],
      sha: match[3],
      file,
      line: lineNumberAt(content, index),
      reference: match[0]
    })
  }

  return references
}

async function validateGithubCommit(
  owner: string,
  repo: string,
  sha: string,
  config: Config
): Promise<ValidationResult> {
  const timeoutMs = config.remoteValidationTimeoutMs ?? DEFAULT_TIMEOUT_MS
  const retries = config.remoteValidationRetries ?? DEFAULT_RETRIES
  const url = githubCommitApiUrl(owner, repo, sha)

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const result = await fetchGithubCommit(url, timeoutMs)
    if (result.status === 'found' || result.status === 'missing') {
      return result
    }
    if (attempt === retries) {
      return result
    }
    await sleep(100 * (attempt + 1))
  }

  return { status: 'error', message: 'validation retry loop exited unexpectedly' }
}

function githubCommitApiUrl(owner: string, repo: string, sha: string): string {
  const apiBaseUrl = githubApiBaseUrl()
  return `${apiBaseUrl}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/commits/${sha}`
}

function githubApiBaseUrl(): string {
  const apiUrl = process.env.GITHUB_API_URL
  if (apiUrl) {
    return apiUrl.replace(/\/+$/, '')
  }

  const serverUrl = githubServerUrl()
  if (serverUrl.hostname.toLowerCase() === 'github.com') {
    return 'https://api.github.com'
  }

  return `${serverUrl.origin}/api/v3`
}

function githubServerHost(): string {
  return githubServerUrl().host.toLowerCase()
}

function githubServerUrl(): URL {
  const rawUrl = process.env.GITHUB_SERVER_URL || 'https://github.com'
  try {
    return new URL(rawUrl)
  } catch {
    return new URL('https://github.com')
  }
}

async function fetchGithubCommit(url: string, timeoutMs: number): Promise<ValidationResult> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await globalThis.fetch(url, {
      method: 'GET',
      headers: githubHeaders(),
      signal: controller.signal
    })

    if (response.status === 200) {
      return { status: 'found' }
    }
    if (response.status === 404) {
      return { status: 'missing' }
    }
    if (response.status === 403 || response.status === 429) {
      return {
        status: 'error',
        message: `GitHub API returned ${response.status} (rate limited or forbidden)`
      }
    }
    if (response.status >= 500) {
      return { status: 'error', message: `GitHub API returned ${response.status}` }
    }

    return { status: 'error', message: `GitHub API returned ${response.status}` }
  } catch (error) {
    return {
      status: 'error',
      message: error instanceof Error ? error.message : String(error)
    }
  } finally {
    clearTimeout(timeout)
  }
}

function githubHeaders(): HeadersInit {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'deterministic-deps'
  }
  const token = process.env.GITHUB_TOKEN
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }
  return headers
}

function remoteFinding(
  ruleId: string,
  reference: RemoteReference,
  severity: Finding['severity'],
  message: string,
  remediation: string
): Finding {
  return {
    ruleId,
    ecosystem: 'remote',
    file: reference.file,
    line: reference.line,
    severity,
    message: `${message} Reference: '${reference.reference}'.`,
    remediation
  }
}

function dedupeRemoteReferences(references: RemoteReference[]): RemoteReference[] {
  const seen = new Set<string>()
  return references.filter((reference) => {
    const key =
      `${reference.file}:${reference.line}:${reference.owner}/${reference.repo}@${reference.sha}`.toLowerCase()
    if (seen.has(key)) {
      return false
    }
    seen.add(key)
    return true
  })
}

function parseYamlDocuments(content: string): unknown[] {
  try {
    return yaml.loadAll(content)
  } catch {
    return []
  }
}

function collectStringProperties(value: unknown, property: string): string[] {
  if (!value || typeof value !== 'object') {
    return []
  }

  if (Array.isArray(value)) {
    return value.flatMap((entry) => collectStringProperties(entry, property))
  }

  return Object.entries(value as Record<string, unknown>).flatMap(([key, entry]) => {
    const current = key === property && typeof entry === 'string' ? [entry] : []
    return [...current, ...collectStringProperties(entry, property)]
  })
}

function lineForYamlScalar(lines: string[], key: string, value: string): number {
  const escapedValue = escapeRegExp(value)
  const pattern = new RegExp(`\\b${escapeRegExp(key)}:\\s*['"]?${escapedValue}['"]?`)
  const index = lines.findIndex((line) => pattern.test(line))
  return index === -1 ? 1 : index + 1
}

function isWorkflowOrActionFile(file: string): boolean {
  return /^\.github\/workflows\/.+\.ya?ml$/i.test(file) || /(^|\/)action\.ya?ml$/i.test(file)
}

function lineNumberAt(content: string, index: number): number {
  return content.slice(0, index).split(/\r?\n/).length
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function sleep(milliseconds: number): Promise<void> {
  return sleepTimeout(milliseconds)
}
