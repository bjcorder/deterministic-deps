import fs from 'node:fs'
import path from 'node:path'
import { Minimatch } from 'minimatch'
import {
  DEFAULT_EXCLUDE,
  DIGEST_PATTERN,
  SEVERITY_ORDER,
  SHA_PATTERN,
  SHORT_SHA_PATTERN
} from './constants'
import { Config, Finding, Severity } from './types'

interface FileContext {
  root: string
  file: string
  absolutePath: string
  content: string
  lines: string[]
}

type RuleHandler = (context: FileContext) => Finding[]

const handlers: RuleHandler[] = [
  checkGithubActions,
  checkDockerLikeFiles,
  checkTerraform,
  checkNode,
  checkPython,
  checkGo,
  checkRust,
  checkJvm,
  checkRuby
]

export function evaluateFile(
  root: string,
  file: string,
  config: Config,
  trackedFiles: Set<string>
): Finding[] {
  const absolutePath = path.join(root, file)
  const content = fs.readFileSync(absolutePath, 'utf8')
  const context: FileContext = {
    root,
    file,
    absolutePath,
    content,
    lines: content.split(/\r?\n/)
  }

  return handlers
    .flatMap((handler) => handler(context))
    .map((finding) => applySeverityOverride(finding, config))
    .filter((finding) => config.rules?.[finding.ruleId] !== false)
    .filter((finding) => hasRequiredCompanionFile(finding, trackedFiles))
    .filter((finding) => !isAllowlisted(finding, config))
}

function checkGithubActions(context: FileContext): Finding[] {
  if (!/\.ya?ml$/i.test(context.file) || !isWorkflowOrActionFile(context.file)) {
    return []
  }

  const findings: Finding[] = []
  context.lines.forEach((line, index) => {
    const usesMatch = line.match(/\buses:\s*['"]?([^'"\s#]+)['"]?/)
    if (!usesMatch) {
      return
    }

    const reference = usesMatch[1]
    if (
      reference.startsWith('./') ||
      reference.startsWith('../') ||
      reference.startsWith('docker://')
    ) {
      if (reference.startsWith('docker://') && !DIGEST_PATTERN.test(reference)) {
        findings.push(
          finding(
            'github-actions/docker-digest',
            'github-actions',
            context.file,
            index + 1,
            'high',
            `Docker action reference '${reference}' is not pinned by digest.`,
            'Use a docker:// image reference with an @sha256 digest.'
          )
        )
      }
      return
    }

    const atIndex = reference.lastIndexOf('@')
    if (atIndex === -1) {
      findings.push(
        finding(
          'github-actions/sha-pin',
          'github-actions',
          context.file,
          index + 1,
          'high',
          `Action '${reference}' is missing an immutable commit SHA ref.`,
          'Pin external actions to a full 40-character commit SHA.'
        )
      )
      return
    }

    const ref = reference.slice(atIndex + 1)
    if (!SHA_PATTERN.test(ref)) {
      findings.push(
        finding(
          SHORT_SHA_PATTERN.test(ref) ? 'github-actions/full-sha' : 'github-actions/sha-pin',
          'github-actions',
          context.file,
          index + 1,
          'high',
          `Action '${reference}' is pinned to '${ref}', not a full commit SHA.`,
          'Replace branch, tag, or short SHA refs with a full 40-character commit SHA.'
        )
      )
    }
  })

  return findings
}

function checkDockerLikeFiles(context: FileContext): Finding[] {
  if (!isDockerLikeFile(context.file)) {
    return []
  }

  const findings: Finding[] = []
  context.lines.forEach((line, index) => {
    const dockerfileMatch = line.match(/^\s*FROM\s+([^\s#]+)/i)
    const yamlImageMatch = line.match(/^\s*image:\s*['"]?([^'"\s#]+)['"]?/i)
    const image = dockerfileMatch?.[1] ?? yamlImageMatch?.[1]

    if (!image || image.toLowerCase() === 'scratch' || image.includes('${')) {
      return
    }

    const severity: Severity =
      /:latest(?:$|@)/i.test(image) || !image.includes(':') ? 'high' : 'medium'
    if (!DIGEST_PATTERN.test(image)) {
      findings.push(
        finding(
          'containers/image-digest',
          'containers',
          context.file,
          index + 1,
          severity,
          `Container image '${image}' is not pinned by digest.`,
          'Use an immutable image reference such as name:tag@sha256:<digest>.'
        )
      )
    }
  })

  return findings
}

function checkTerraform(context: FileContext): Finding[] {
  if (!context.file.endsWith('.tf')) {
    return []
  }

  const findings: Finding[] = []
  const hasTerraformLock = fs.existsSync(
    path.join(path.dirname(context.absolutePath), '.terraform.lock.hcl')
  )

  context.lines.forEach((line, index) => {
    const sourceMatch = line.match(/\bsource\s*=\s*"([^"]+)"/)
    if (sourceMatch && isGitReference(sourceMatch[1]) && !hasCommitQuery(sourceMatch[1])) {
      findings.push(
        finding(
          'terraform/git-module-sha',
          'terraform',
          context.file,
          index + 1,
          'high',
          `Terraform module source '${sourceMatch[1]}' does not pin a commit SHA.`,
          'Add ?ref=<40-character commit SHA> to git module sources.'
        )
      )
    }

    const versionMatch = line.match(/\bversion\s*=\s*"([^"]+)"/)
    if (versionMatch && !hasTerraformLock && !isExactVersion(versionMatch[1])) {
      findings.push(
        finding(
          'terraform/provider-lock',
          'terraform',
          context.file,
          index + 1,
          'medium',
          `Terraform provider constraint '${versionMatch[1]}' is not exact and no .terraform.lock.hcl was found.`,
          'Commit .terraform.lock.hcl or use exact provider versions.'
        )
      )
    }
  })

  return findings
}

function checkNode(context: FileContext): Finding[] {
  if (!context.file.endsWith('package.json')) {
    return []
  }

  const findings: Finding[] = []
  const directory = path.dirname(context.absolutePath)
  const hasLock = ['package-lock.json', 'npm-shrinkwrap.json', 'yarn.lock', 'pnpm-lock.yaml'].some(
    (lock) => fs.existsSync(path.join(directory, lock))
  )
  const json = safeJson(context.content)
  if (!json) {
    return []
  }

  if (!hasLock && hasRuntimeDependencies(json)) {
    findings.push(
      finding(
        'node/lockfile-required',
        'node',
        context.file,
        1,
        'high',
        'package.json declares dependencies but no npm, Yarn, or pnpm lockfile was found.',
        'Commit package-lock.json, npm-shrinkwrap.json, yarn.lock, or pnpm-lock.yaml.'
      )
    )
  }

  for (const [section, dependencies] of dependencySections(json)) {
    for (const [name, spec] of Object.entries(dependencies)) {
      if (typeof spec !== 'string' || isNodeSpecDeterministic(spec)) {
        continue
      }

      findings.push(
        finding(
          'node/non-deterministic-spec',
          'node',
          context.file,
          lineForText(context.lines, `"${name}"`),
          'medium',
          `${section} dependency '${name}' uses non-deterministic spec '${spec}'.`,
          'Use exact versions with a committed lockfile, workspace/file links, or git commit SHAs.'
        )
      )
    }
  }

  return findings
}

function checkPython(context: FileContext): Finding[] {
  if (!isPythonFile(context.file)) {
    return []
  }

  if (context.file.endsWith('pyproject.toml') || context.file.endsWith('Pipfile')) {
    return checkPythonProjectFile(context)
  }

  const findings: Finding[] = []
  context.lines.forEach((line, index) => {
    const trimmed = line.trim()
    if (
      !trimmed ||
      trimmed.startsWith('#') ||
      trimmed.startsWith('-r ') ||
      trimmed.startsWith('--')
    ) {
      return
    }

    if (isGitReference(trimmed) && !hasCommitReference(trimmed)) {
      findings.push(
        finding(
          'python/git-sha',
          'python',
          context.file,
          index + 1,
          'high',
          `Python git dependency '${trimmed}' is not pinned to a commit SHA.`,
          'Use @<40-character commit SHA> for git dependencies.'
        )
      )
      return
    }

    if (/[<>=~!]=/.test(trimmed) && (!/==[^=]/.test(trimmed) || !trimmed.includes('--hash='))) {
      findings.push(
        finding(
          'python/hash-pinned-requirement',
          'python',
          context.file,
          index + 1,
          'medium',
          `Requirement '${trimmed}' is not exactly pinned with a hash.`,
          'Use exact == pins and --hash entries, for example from pip-compile --generate-hashes.'
        )
      )
    }
  })

  return findings
}

function checkPythonProjectFile(context: FileContext): Finding[] {
  const directory = path.dirname(context.absolutePath)
  const locks = ['poetry.lock', 'uv.lock', 'Pipfile.lock']
  if (locks.some((lock) => fs.existsSync(path.join(directory, lock)))) {
    return []
  }

  return [
    finding(
      'python/lockfile-required',
      'python',
      context.file,
      1,
      'high',
      `${path.basename(context.file)} was found without poetry.lock, uv.lock, or Pipfile.lock.`,
      'Commit the ecosystem lockfile for Python project dependency declarations.'
    )
  ]
}

function checkGo(context: FileContext): Finding[] {
  if (!context.file.endsWith('go.mod')) {
    return []
  }

  const findings: Finding[] = []
  const directory = path.dirname(context.absolutePath)
  if (!fs.existsSync(path.join(directory, 'go.sum'))) {
    findings.push(
      finding(
        'go/sum-required',
        'go',
        context.file,
        1,
        'high',
        'go.mod was found without go.sum.',
        'Commit go.sum so module checksums are locked.'
      )
    )
  }

  context.lines.forEach((line, index) => {
    if (/\breplace\b/.test(line) && isGitReference(line) && !hasCommitReference(line)) {
      findings.push(
        finding(
          'go/git-replace-sha',
          'go',
          context.file,
          index + 1,
          'medium',
          `Go replace directive '${line.trim()}' does not pin a commit SHA.`,
          'Use immutable pseudo-versions or commit SHA refs for git replacements.'
        )
      )
    }
  })

  return findings
}

function checkRust(context: FileContext): Finding[] {
  if (!context.file.endsWith('Cargo.toml')) {
    return []
  }

  const findings: Finding[] = []
  const directory = path.dirname(context.absolutePath)
  if (!fs.existsSync(path.join(directory, 'Cargo.lock'))) {
    findings.push(
      finding(
        'rust/lockfile-required',
        'rust',
        context.file,
        1,
        'high',
        'Cargo.toml was found without Cargo.lock.',
        'Commit Cargo.lock for applications and workspaces that need deterministic builds.'
      )
    )
  }

  context.lines.forEach((line, index) => {
    if (line.includes('git =') && !/\brev\s*=\s*["'][a-f0-9]{40}["']/i.test(line)) {
      findings.push(
        finding(
          'rust/git-rev-sha',
          'rust',
          context.file,
          index + 1,
          'high',
          `Rust git dependency '${line.trim()}' does not pin a rev commit SHA.`,
          'Add rev = "<40-character commit SHA>" to git dependencies.'
        )
      )
    }
  })

  return findings
}

function checkJvm(context: FileContext): Finding[] {
  if (!/(pom\.xml|build\.gradle|build\.gradle\.kts)$/.test(context.file)) {
    return []
  }

  const findings: Finding[] = []
  context.lines.forEach((line, index) => {
    if (
      /\bSNAPSHOT\b|latest\.[\w-]+|['"][^'"]*\+['"]|\[[^\]]*,[^\]]*\]|\([^)]+,[^)]+\)/i.test(line)
    ) {
      findings.push(
        finding(
          'jvm/dynamic-version',
          'jvm',
          context.file,
          index + 1,
          'medium',
          `JVM dependency declaration '${line.trim()}' appears dynamic.`,
          'Use fixed release versions and dependency verification or lockfiles where supported.'
        )
      )
    }
  })

  return findings
}

function checkRuby(context: FileContext): Finding[] {
  if (!context.file.endsWith('Gemfile')) {
    return []
  }

  const findings: Finding[] = []
  const directory = path.dirname(context.absolutePath)
  if (!fs.existsSync(path.join(directory, 'Gemfile.lock'))) {
    findings.push(
      finding(
        'ruby/lockfile-required',
        'ruby',
        context.file,
        1,
        'high',
        'Gemfile was found without Gemfile.lock.',
        'Commit Gemfile.lock so resolved gem versions are deterministic.'
      )
    )
  }

  context.lines.forEach((line, index) => {
    if (line.includes('git:') && !/ref:\s*['"][a-f0-9]{40}['"]/i.test(line)) {
      findings.push(
        finding(
          'ruby/git-ref-sha',
          'ruby',
          context.file,
          index + 1,
          'high',
          `Ruby git dependency '${line.trim()}' does not pin a ref commit SHA.`,
          'Add ref: "<40-character commit SHA>" to git dependencies.'
        )
      )
    }
  })

  return findings
}

function isWorkflowOrActionFile(file: string): boolean {
  return file.startsWith('.github/workflows/') || /^action\.ya?ml$/i.test(file)
}

function isDockerLikeFile(file: string): boolean {
  const normalized = file.replaceAll('\\', '/')
  return (
    /(^|\/)Dockerfile(\.|$)/.test(normalized) ||
    /(^|\/)(docker-)?compose.*\.ya?ml$/i.test(normalized) ||
    normalized === '.devcontainer/devcontainer.json'
  )
}

function isPythonFile(file: string): boolean {
  return (
    /requirements.*\.txt$/.test(file) || file.endsWith('pyproject.toml') || file.endsWith('Pipfile')
  )
}

function safeJson(content: string): Record<string, unknown> | undefined {
  try {
    return JSON.parse(content) as Record<string, unknown>
  } catch {
    return undefined
  }
}

function hasRuntimeDependencies(json: Record<string, unknown>): boolean {
  return dependencySections(json).some(([, dependencies]) => Object.keys(dependencies).length > 0)
}

function dependencySections(
  json: Record<string, unknown>
): Array<[string, Record<string, unknown>]> {
  return ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']
    .map((section) => [section, json[section]] as const)
    .filter(
      (entry): entry is [string, Record<string, unknown>] =>
        Boolean(entry[1]) && typeof entry[1] === 'object'
    )
}

function isNodeSpecDeterministic(spec: string): boolean {
  if (/^(workspace:|file:|link:|portal:|patch:)/.test(spec)) {
    return true
  }
  if (/^(git\+)?https?:.*#[a-f0-9]{40}$/i.test(spec) || /^github:[^#]+#[a-f0-9]{40}$/i.test(spec)) {
    return true
  }
  return /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(spec)
}

function lineForText(lines: string[], text: string): number {
  const index = lines.findIndex((line) => line.includes(text))
  return index === -1 ? 1 : index + 1
}

function isGitReference(value: string): boolean {
  return /\bgit\+|git::|github\.com|gitlab\.com|bitbucket\.org|\.git\b/.test(value)
}

function hasCommitQuery(value: string): boolean {
  const ref = value.match(/[?&]ref=([^&]+)/)?.[1]
  return Boolean(ref && SHA_PATTERN.test(ref))
}

function hasCommitReference(value: string): boolean {
  return /[@#=][a-f0-9]{40}\b/i.test(value) || /\b[a-f0-9]{40}\b/i.test(value)
}

function isExactVersion(value: string): boolean {
  return /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(value)
}

function applySeverityOverride(finding: Finding, config: Config): Finding {
  const override = config.severityOverrides?.[finding.ruleId]
  return override ? { ...finding, severity: override } : finding
}

function hasRequiredCompanionFile(finding: Finding, trackedFiles: Set<string>): boolean {
  if (!finding.ruleId.endsWith('lockfile-required') && finding.ruleId !== 'go/sum-required') {
    return true
  }

  return trackedFiles.has(finding.file)
}

function isAllowlisted(finding: Finding, config: Config): boolean {
  const entries = config.allowlist ?? []
  return entries.some((entry) => {
    const fileMatches = !entry.file || new Minimatch(entry.file).match(finding.file)
    const ruleMatches = !entry.ruleId || entry.ruleId === finding.ruleId
    const ecosystemMatches = !entry.ecosystem || entry.ecosystem === finding.ecosystem
    const lineMatches = !entry.line || entry.line === finding.line
    return fileMatches && ruleMatches && ecosystemMatches && lineMatches
  })
}

export function shouldReportFailure(findings: Finding[], threshold: Severity): boolean {
  return findings.some((finding) => SEVERITY_ORDER[finding.severity] >= SEVERITY_ORDER[threshold])
}

export function defaultExcludeMatchers(): Minimatch[] {
  return DEFAULT_EXCLUDE.map((pattern) => new Minimatch(pattern, { dot: true }))
}

function finding(
  ruleId: string,
  ecosystem: string,
  file: string,
  line: number,
  severity: Severity,
  message: string,
  remediation: string
): Finding {
  return {
    ruleId,
    ecosystem,
    file,
    line,
    severity,
    message,
    remediation
  }
}
