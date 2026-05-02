import fs from 'node:fs'
import path from 'node:path'
import yaml from 'js-yaml'
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
  config: Config
  lines: string[]
}

interface NumberedLine {
  text: string
  number: number
}

interface TerraformBlock {
  type: string
  lines: NumberedLine[]
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
    config,
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
  const references = parseYamlDocuments(context.content).flatMap((document) =>
    collectStringProperties(document, 'uses')
  )

  for (const reference of references) {
    const line = lineForYamlScalar(context.lines, 'uses', reference)
    const findingForReference = checkActionReference(context.file, line, reference)
    if (findingForReference) {
      findings.push(findingForReference)
    }
  }

  if (references.length > 0) {
    return findings
  }

  return checkGithubActionsWithLineFallback(context)
}

function checkActionReference(file: string, line: number, reference: string): Finding | undefined {
  if (reference.startsWith('./') || reference.startsWith('../')) {
    return undefined
  }

  if (reference.startsWith('docker://')) {
    if (DIGEST_PATTERN.test(reference)) {
      return undefined
    }

    return finding(
      'github-actions/docker-digest',
      'github-actions',
      file,
      line,
      'high',
      `Docker action reference '${reference}' is not pinned by digest.`,
      'Use a docker:// image reference with an @sha256 digest.'
    )
  }

  const atIndex = reference.lastIndexOf('@')
  if (atIndex === -1) {
    return finding(
      'github-actions/sha-pin',
      'github-actions',
      file,
      line,
      'high',
      `Action '${reference}' is missing an immutable commit SHA ref.`,
      'Pin external actions to a full 40-character commit SHA.'
    )
  }

  const ref = reference.slice(atIndex + 1)
  if (SHA_PATTERN.test(ref)) {
    return undefined
  }

  return finding(
    SHORT_SHA_PATTERN.test(ref) ? 'github-actions/full-sha' : 'github-actions/sha-pin',
    'github-actions',
    file,
    line,
    'high',
    `Action '${reference}' is pinned to '${ref}', not a full commit SHA.`,
    'Replace branch, tag, or short SHA refs with a full 40-character commit SHA.'
  )
}

function checkGithubActionsWithLineFallback(context: FileContext): Finding[] {
  return context.lines.flatMap((line, index) => {
    const usesMatch = line.match(/\buses:\s*['"]?([^'"\s#]+)['"]?/)
    if (!usesMatch) {
      return []
    }

    const findingForReference = checkActionReference(context.file, index + 1, usesMatch[1])
    return findingForReference ? [findingForReference] : []
  })
}

function checkDockerLikeFiles(context: FileContext): Finding[] {
  if (!isDockerLikeFile(context.file)) {
    return []
  }

  if (!isDockerfile(context.file)) {
    return checkStructuredContainerFile(context)
  }

  const findings: Finding[] = []
  context.lines.forEach((line, index) => {
    const dockerfileMatch = line.match(/^\s*FROM\s+([^\s#]+)/i)
    const image = dockerfileMatch?.[1]

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

function checkStructuredContainerFile(context: FileContext): Finding[] {
  const references = context.file.endsWith('.json')
    ? collectStringProperties(safeJson(context.content), 'image')
    : parseYamlDocuments(context.content).flatMap((document) =>
        collectStringProperties(document, 'image')
      )

  return references.flatMap((image) => {
    if (!image || image.toLowerCase() === 'scratch' || image.includes('${')) {
      return []
    }

    const severity: Severity =
      /:latest(?:$|@)/i.test(image) || !image.includes(':') ? 'high' : 'medium'

    if (DIGEST_PATTERN.test(image)) {
      return []
    }

    return [
      finding(
        'containers/image-digest',
        'containers',
        context.file,
        lineForYamlScalar(context.lines, 'image', image),
        severity,
        `Container image '${image}' is not pinned by digest.`,
        'Use an immutable image reference such as name:tag@sha256:<digest>.'
      )
    ]
  })
}

function checkTerraform(context: FileContext): Finding[] {
  if (!context.file.endsWith('.tf')) {
    return []
  }

  const findings: Finding[] = []
  const hasTerraformLock = fs.existsSync(
    path.join(path.dirname(context.absolutePath), '.terraform.lock.hcl')
  )
  const blocks = terraformBlocks(context)

  for (const block of blocks.filter((entry) => entry.type === 'module')) {
    for (const line of block.lines) {
      const sourceMatch = line.text.match(/\bsource\s*=\s*"([^"]+)"/)
      if (!sourceMatch || !isGitReference(sourceMatch[1]) || hasCommitQuery(sourceMatch[1])) {
        continue
      }

      findings.push(
        finding(
          'terraform/git-module-sha',
          'terraform',
          context.file,
          line.number,
          'high',
          `Terraform module source '${sourceMatch[1]}' does not pin a commit SHA.`,
          'Add ?ref=<40-character commit SHA> to git module sources.'
        )
      )
    }
  }

  for (const block of blocks.filter(isTerraformProviderBlock)) {
    for (const line of block.lines) {
      const versionMatch = line.text.match(/\bversion\s*=\s*"([^"]+)"/)
      if (
        !versionMatch ||
        hasTerraformLock ||
        isExactVersion(versionMatch[1]) ||
        !ecosystemBoolean(context.config, 'terraform', 'requireProviderLock', true)
      ) {
        continue
      }

      findings.push(
        finding(
          'terraform/provider-lock',
          'terraform',
          context.file,
          line.number,
          'medium',
          `Terraform provider constraint '${versionMatch[1]}' is not exact and no .terraform.lock.hcl was found.`,
          'Commit .terraform.lock.hcl or use exact provider versions.'
        )
      )
    }
  }

  if (blocks.length > 0) {
    return findings
  }

  context.lines.forEach((line, index) => {
    const stripped = stripTerraformComment(line)
    const sourceMatch = stripped.match(/\bsource\s*=\s*"([^"]+)"/)
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

    const versionMatch = stripped.match(/\bversion\s*=\s*"([^"]+)"/)
    if (
      versionMatch &&
      !hasTerraformLock &&
      !isExactVersion(versionMatch[1]) &&
      ecosystemBoolean(context.config, 'terraform', 'requireProviderLock', true)
    ) {
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

  if (
    !hasLock &&
    hasRuntimeDependencies(json) &&
    ecosystemBoolean(context.config, 'node', 'requireLockfile', true)
  ) {
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
      if (
        typeof spec !== 'string' ||
        isNodeSpecDeterministic(spec) ||
        (hasLock &&
          ecosystemBoolean(context.config, 'node', 'allowVersionRangesWithLockfile', false) &&
          isNodeRegistryVersionSpec(spec))
      ) {
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

    if (
      ecosystemBoolean(context.config, 'python', 'requireRequirementHashes', true) &&
      /[<>=~!]=/.test(trimmed) &&
      (!/==[^=]/.test(trimmed) || !trimmed.includes('--hash='))
    ) {
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
  if (
    !ecosystemBoolean(context.config, 'python', 'requireProjectLockfile', true) ||
    locks.some((lock) => fs.existsSync(path.join(directory, lock)))
  ) {
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
  if (
    !fs.existsSync(path.join(directory, 'go.sum')) &&
    ecosystemBoolean(context.config, 'go', 'requireGoSum', true)
  ) {
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
  if (
    !fs.existsSync(path.join(directory, 'Cargo.lock')) &&
    ecosystemBoolean(context.config, 'rust', 'requireLockfile', true)
  ) {
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
  if (
    !fs.existsSync(path.join(directory, 'Gemfile.lock')) &&
    ecosystemBoolean(context.config, 'ruby', 'requireLockfile', true)
  ) {
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
    isDockerfile(normalized) ||
    /(^|\/)(docker-)?compose.*\.ya?ml$/i.test(normalized) ||
    normalized === '.devcontainer/devcontainer.json'
  )
}

function isDockerfile(file: string): boolean {
  return /(^|\/)Dockerfile(\.|$)/.test(file.replaceAll('\\', '/'))
}

function isPythonFile(file: string): boolean {
  return (
    /requirements.*\.txt$/.test(file) || file.endsWith('pyproject.toml') || file.endsWith('Pipfile')
  )
}

function parseYamlDocuments(content: string): unknown[] {
  try {
    return yaml.loadAll(content)
  } catch {
    return []
  }
}

function collectStringProperties(value: unknown, propertyName: string): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((entry) => collectStringProperties(entry, propertyName))
  }

  if (!isRecord(value)) {
    return []
  }

  const direct = typeof value[propertyName] === 'string' ? [value[propertyName]] : []
  const nested = Object.values(value).flatMap((entry) =>
    collectStringProperties(entry, propertyName)
  )
  return [...direct, ...nested]
}

function terraformBlocks(context: FileContext): TerraformBlock[] {
  const blocks: TerraformBlock[] = []
  let activeBlock: TerraformBlock | undefined
  let depth = 0

  context.lines.forEach((rawLine, index) => {
    const text = stripTerraformComment(rawLine)
    const startMatch = text.match(/^\s*(module|provider|terraform)\b(?:\s+"[^"]+"){0,2}\s*\{/)

    if (!activeBlock && startMatch) {
      activeBlock = {
        type: startMatch[1],
        lines: []
      }
      depth = 0
    }

    if (!activeBlock) {
      return
    }

    activeBlock.lines.push({ text, number: index + 1 })
    depth += braceDelta(text)

    if (depth <= 0) {
      blocks.push(activeBlock)
      activeBlock = undefined
    }
  })

  return blocks
}

function isTerraformProviderBlock(block: TerraformBlock): boolean {
  if (block.type === 'provider') {
    return true
  }

  return (
    block.type === 'terraform' &&
    block.lines.some((line) => /\brequired_providers\b/.test(line.text))
  )
}

function stripTerraformComment(line: string): string {
  let quote: '"' | undefined

  for (let index = 0; index < line.length; index += 1) {
    const current = line[index]
    const previous = line[index - 1]

    if (current === '"' && previous !== '\\') {
      quote = quote ? undefined : '"'
    }

    if (!quote && current === '#') {
      return line.slice(0, index)
    }

    if (!quote && current === '/' && line[index + 1] === '/') {
      return line.slice(0, index)
    }
  }

  return line
}

function braceDelta(line: string): number {
  let quote: '"' | undefined
  let delta = 0

  for (let index = 0; index < line.length; index += 1) {
    const current = line[index]
    const previous = line[index - 1]

    if (current === '"' && previous !== '\\') {
      quote = quote ? undefined : '"'
      continue
    }

    if (quote) {
      continue
    }

    if (current === '{') {
      delta += 1
    } else if (current === '}') {
      delta -= 1
    }
  }

  return delta
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
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

function isNodeRegistryVersionSpec(spec: string): boolean {
  return !/^(git\+|git:|github:|https?:|ssh:|file:|workspace:|link:|portal:|patch:)/.test(spec)
}

function ecosystemBoolean(
  config: Config,
  ecosystem: string,
  key: string,
  fallback: boolean
): boolean {
  const value = config.ecosystems?.[ecosystem]?.[key]
  return typeof value === 'boolean' ? value : fallback
}

function lineForText(lines: string[], text: string): number {
  const index = lines.findIndex((line) => line.includes(text))
  return index === -1 ? 1 : index + 1
}

function lineForYamlScalar(lines: string[], key: string, value: string): number {
  const escaped = escapeRegExp(value)
  const pattern = new RegExp(`\\b${escapeRegExp(key)}\\s*:\\s*['"]?${escaped}['"]?\\s*(?:#.*)?$`)
  const index = lines.findIndex((line) => pattern.test(line.trim()))
  return index === -1 ? lineForText(lines, value) : index + 1
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
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
