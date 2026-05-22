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
} from '../constants'
import { sanitizeFinding } from '../redaction'
import { Config, Finding, Severity } from '../types'

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

export interface Rule {
  id: string
  ecosystem: string
  defaultSeverity: Severity
  description: string
  evaluate: RuleHandler
}

interface NodeDependencyEntry {
  section: string
  name: string
  spec: string
  line: number
}

interface NodeLockfile {
  type: 'npm' | 'yarn' | 'pnpm'
  path: string
  dependencies: Set<string>
  specs: Set<string>
  integrityDependencies: Set<string>
}

interface PythonDependencyEntry {
  source: string
  text: string
  line: number
  hasHash?: boolean
  editable?: boolean
}

interface GoDirective {
  keyword: string
  text: string
  line: number
}

interface RustDependencyEntry {
  name: string
  text: string
  line: number
  lineText?: string
}

interface RubyGemEntry {
  text: string
  line: number
}

interface JvmVersionEntry {
  source: 'maven' | 'gradle'
  text: string
  version: string
  line: number
}

interface GithubActionsRunnerReference {
  label: string
  line: number
}

export const rules: Rule[] = [
  rule(
    'github-actions/sha-pin',
    'github-actions',
    'high',
    'External GitHub Actions references must use full commit SHA refs.',
    checkGithubActions
  ),
  rule(
    'github-actions/full-sha',
    'github-actions',
    'high',
    'Short GitHub Actions SHAs are rejected because they are not explicit enough.',
    checkGithubActions
  ),
  rule(
    'github-actions/docker-digest',
    'github-actions',
    'high',
    'Docker action references must include sha256 digests.',
    checkGithubActions
  ),
  rule(
    'github-actions/versioned-runner',
    'github-actions',
    'medium',
    'GitHub-hosted runner labels should use versioned operating system labels.',
    checkGithubActions
  ),
  rule(
    'containers/image-digest',
    'containers',
    'medium',
    'Container image references should include immutable sha256 digests.',
    checkDockerLikeFiles
  ),
  rule(
    'terraform/git-module-sha',
    'terraform',
    'high',
    'Terraform module git sources must use full commit SHA refs.',
    checkTerraform
  ),
  rule(
    'terraform/provider-lock',
    'terraform',
    'medium',
    'Terraform provider constraints require exact versions or provider lockfiles.',
    checkTerraform
  ),
  rule(
    'node/lockfile-required',
    'node',
    'high',
    'Node package manifests with dependencies require a package manager lockfile.',
    checkNode
  ),
  rule(
    'node/lockfile-coverage',
    'node',
    'medium',
    'Node registry dependencies require lockfile entries with integrity metadata.',
    checkNode
  ),
  rule(
    'node/non-deterministic-spec',
    'node',
    'medium',
    'Node dependencies must avoid ranges, tags, branch refs, and unpinned git specs.',
    checkNode
  ),
  rule(
    'python/hash-pinned-requirement',
    'python',
    'medium',
    'Requirements entries should use exact pins with hash metadata.',
    checkPython
  ),
  rule(
    'python/git-sha',
    'python',
    'high',
    'Python git dependencies must pin full commit SHAs.',
    checkPython
  ),
  rule(
    'python/lockfile-required',
    'python',
    'high',
    'Python project dependency declarations require supported lockfiles.',
    checkPython
  ),
  rule('go/sum-required', 'go', 'high', 'Go modules require go.sum.', checkGo),
  rule(
    'go/git-replace-sha',
    'go',
    'medium',
    'Go replace directives that use git sources require immutable refs.',
    checkGo
  ),
  rule(
    'rust/lockfile-required',
    'rust',
    'high',
    'Cargo manifests require Cargo.lock for deterministic application builds.',
    checkRust
  ),
  rule(
    'rust/git-rev-sha',
    'rust',
    'high',
    'Rust git dependencies must include full rev commit SHAs.',
    checkRust
  ),
  rule(
    'rust/toolchain-version',
    'rust',
    'medium',
    'Rust toolchain files must avoid floating stable, beta, and nightly channels.',
    checkRust
  ),
  rule(
    'jvm/dynamic-version',
    'jvm',
    'medium',
    'Maven and Gradle declarations reject dynamic JVM versions unless supported Gradle metadata satisfies policy.',
    checkJvm
  ),
  rule(
    'ruby/lockfile-required',
    'ruby',
    'high',
    'Gemfiles require Gemfile.lock for deterministic resolution.',
    checkRuby
  ),
  rule(
    'ruby/git-ref-sha',
    'ruby',
    'high',
    'Ruby git dependencies must pin full ref commit SHAs.',
    checkRuby
  ),
  rule(
    'remote/github-ref',
    'remote',
    'high',
    'Remote validation reports pinned GitHub commit SHAs that cannot be found.',
    noFileFindings
  ),
  rule(
    'remote/validation-error',
    'remote',
    'low',
    'Remote validation reports deterministic findings for timeout, rate-limit, authorization, and API errors.',
    noFileFindings
  )
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

  return uniqueRuleHandlers()
    .flatMap((handler) => handler(context))
    .map((finding) => applySeverityOverride(finding, config))
    .map(sanitizeFinding)
    .filter((finding) => shouldKeepFinding(finding, config, trackedFiles))
}

export function finalizeFindings(
  findings: Finding[],
  config: Config,
  trackedFiles: Set<string>
): Finding[] {
  return findings
    .map((finding) => applySeverityOverride(finding, config))
    .map(sanitizeFinding)
    .filter((finding) => shouldKeepFinding(finding, config, trackedFiles))
}

function shouldKeepFinding(finding: Finding, config: Config, trackedFiles: Set<string>): boolean {
  return (
    config.rules?.[finding.ruleId] !== false &&
    hasRequiredCompanionFile(finding, trackedFiles) &&
    !isAllowlisted(finding, config)
  )
}

function uniqueRuleHandlers(): RuleHandler[] {
  return Array.from(new Set(rules.map((ruleDefinition) => ruleDefinition.evaluate)))
}

function checkGithubActions(context: FileContext): Finding[] {
  if (!/\.ya?ml$/i.test(context.file) || !isWorkflowOrActionFile(context.file)) {
    return []
  }

  const findings: Finding[] = []
  const documents = parseYamlDocuments(context.content)
  const references = documents.flatMap((document) => collectStringProperties(document, 'uses'))
  const runnerReferences = documents.flatMap((document) =>
    collectGithubActionsRunnerReferences(document, context.lines)
  )

  for (const reference of references) {
    const line = lineForYamlScalar(context.lines, 'uses', reference)
    const findingForReference = checkActionReference(context.file, line, reference)
    if (findingForReference) {
      findings.push(findingForReference)
    }
  }

  for (const runnerReference of runnerReferences) {
    const findingForRunner = checkGithubActionsRunnerLabel(
      context.file,
      runnerReference.line,
      runnerReference.label
    )
    if (findingForRunner) {
      findings.push(findingForRunner)
    }
  }

  if (documents.length > 0 && (references.length > 0 || runnerReferences.length > 0)) {
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

function checkGithubActionsRunnerLabel(
  file: string,
  line: number,
  label: string
): Finding | undefined {
  if (!isFloatingGithubHostedRunnerLabel(label)) {
    return undefined
  }

  return finding(
    'github-actions/versioned-runner',
    'github-actions',
    file,
    line,
    'medium',
    `GitHub-hosted runner label '${label}' can move to a new image without a workflow change.`,
    'Use a versioned runner label such as ubuntu-24.04, windows-2025, or macos-15.'
  )
}

function checkGithubActionsWithLineFallback(context: FileContext): Finding[] {
  const findings: Finding[] = []

  context.lines.forEach((line, index) => {
    const usesMatch = line.match(/\buses:\s*['"]?([^'"\s#]+)['"]?/)
    if (usesMatch) {
      const findingForReference = checkActionReference(context.file, index + 1, usesMatch[1])
      if (findingForReference) {
        findings.push(findingForReference)
      }
    }

    const runsOnMatch = line.match(/\bruns-on:\s*(.+)$/)
    if (!runsOnMatch) {
      return
    }

    for (const label of parseFallbackRunsOnLabels(runsOnMatch[1])) {
      const findingForRunner = checkGithubActionsRunnerLabel(context.file, index + 1, label)
      if (findingForRunner) {
        findings.push(findingForRunner)
      }
    }
  })

  return findings
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
  const lockfiles = readNodeLockfiles(directory)
  const hasLock = lockfiles.length > 0
  const json = safeJson(context.content)
  if (!json) {
    return []
  }

  const entries = nodeDependencyEntries(json, context.lines)
  if (
    !hasLock &&
    entries.some((entry) => entry.section !== 'packageManager') &&
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

  for (const entry of entries) {
    const deterministic = isNodeSpecDeterministic(entry.spec)
    const registrySpec = isNodeRegistryVersionSpec(entry.spec)
    const rangesAllowedWithLock =
      hasLock &&
      registrySpec &&
      ecosystemBoolean(context.config, 'node', 'allowVersionRangesWithLockfile', false)

    if (!deterministic && !rangesAllowedWithLock) {
      findings.push(
        finding(
          'node/non-deterministic-spec',
          'node',
          context.file,
          entry.line,
          'medium',
          `${entry.section} dependency '${entry.name}' uses non-deterministic spec '${entry.spec}'.`,
          'Use exact versions with lockfile coverage, workspace/file links, or immutable git and URL references.'
        )
      )
      continue
    }

    if (hasLock && registrySpec && !hasNodeLockCoverage(entry, lockfiles)) {
      findings.push(
        finding(
          'node/lockfile-coverage',
          'node',
          context.file,
          entry.line,
          'medium',
          `${entry.section} dependency '${entry.name}' is not covered by a lockfile entry with integrity metadata.`,
          'Regenerate and commit the npm, Yarn, or pnpm lockfile so registry dependencies include resolved integrity.'
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
  for (const requirement of parseRequirementsEntries(context.lines)) {
    if (isPythonGitDependency(requirement.text) && !hasCommitReference(requirement.text)) {
      findings.push(
        finding(
          'python/git-sha',
          'python',
          context.file,
          requirement.line,
          'high',
          `Python git dependency '${requirement.text}' is not pinned to a commit SHA.`,
          'Use @<40-character commit SHA> for git dependencies.'
        )
      )
      continue
    }

    if (
      ecosystemBoolean(context.config, 'python', 'requireRequirementHashes', true) &&
      isHashableRequirement(requirement.text) &&
      (!isExactPythonRequirement(requirement.text) || !requirement.hasHash)
    ) {
      findings.push(
        finding(
          'python/hash-pinned-requirement',
          'python',
          context.file,
          requirement.line,
          'medium',
          `Requirement '${requirement.text}' is not exactly pinned with a hash.`,
          'Use exact == pins and --hash entries, for example from pip-compile --generate-hashes.'
        )
      )
    }
  }

  return findings
}

function checkPythonProjectFile(context: FileContext): Finding[] {
  const findings: Finding[] = []
  const directory = path.dirname(context.absolutePath)
  const locks = ['poetry.lock', 'uv.lock', 'Pipfile.lock']
  const dependencies = context.file.endsWith('Pipfile')
    ? parsePipfileDependencyEntries(context.lines)
    : parsePyprojectDependencyEntries(context.lines)

  if (
    dependencies.length > 0 &&
    ecosystemBoolean(context.config, 'python', 'requireProjectLockfile', true) &&
    !locks.some((lock) => fs.existsSync(path.join(directory, lock)))
  ) {
    findings.push(
      finding(
        'python/lockfile-required',
        'python',
        context.file,
        1,
        'high',
        `${path.basename(context.file)} was found without poetry.lock, uv.lock, or Pipfile.lock.`,
        'Commit the ecosystem lockfile for Python project dependency declarations.'
      )
    )
  }

  for (const dependency of dependencies) {
    if (!isPythonGitDependency(dependency.text) || hasCommitReference(dependency.text)) {
      continue
    }

    findings.push(
      finding(
        'python/git-sha',
        'python',
        context.file,
        dependency.line,
        'high',
        `Python ${dependency.source} dependency '${dependency.text}' is not pinned to a commit SHA.`,
        'Use a full 40-character commit SHA for git dependencies.'
      )
    )
  }

  return findings
}

function parseRequirementsEntries(lines: string[]): PythonDependencyEntry[] {
  const entries: PythonDependencyEntry[] = []
  let active = ''
  let activeLine = 1

  lines.forEach((line, index) => {
    const withoutComment = stripPythonComment(line).trim()
    if (!withoutComment) {
      return
    }

    const continued = /\\\s*$/.test(withoutComment)
    const segment = withoutComment.replace(/\\\s*$/, '').trim()
    if (!active) {
      activeLine = index + 1
    }
    active = [active, segment].filter(Boolean).join(' ')

    if (continued) {
      return
    }

    const normalized = active.replace(/\s+/g, ' ').trim()
    active = ''

    if (isRequirementsOptionOnly(normalized)) {
      return
    }

    entries.push({
      source: 'requirements',
      text: normalized,
      line: activeLine,
      hasHash: /(?:^|\s)--hash[=\s]/.test(normalized),
      editable: /^(-e|--editable)(?:\s|=)/.test(normalized)
    })
  })

  if (active) {
    entries.push({
      source: 'requirements',
      text: active.replace(/\s+/g, ' ').trim(),
      line: activeLine,
      hasHash: /(?:^|\s)--hash[=\s]/.test(active)
    })
  }

  return entries
}

function parsePyprojectDependencyEntries(lines: string[]): PythonDependencyEntry[] {
  const entries: PythonDependencyEntry[] = []
  let section = ''
  let multilineArray:
    | {
        source: string
        line: number
        text: string
      }
    | undefined

  lines.forEach((line, index) => {
    const trimmed = stripPythonComment(line).trim()
    if (!trimmed) {
      return
    }

    const sectionMatch = trimmed.match(/^\[([^\]]+)\]$/)
    if (sectionMatch) {
      section = sectionMatch[1]
      return
    }

    if (multilineArray) {
      multilineArray.text += ` ${trimmed}`
      if (trimmed.includes(']')) {
        entries.push(
          ...pythonArrayEntries(multilineArray.text, multilineArray.source, multilineArray.line)
        )
        multilineArray = undefined
      }
      return
    }

    if (section === 'project' || section.startsWith('project.optional-dependencies')) {
      const arrayMatch = trimmed.match(/^([A-Za-z0-9_.-]+)\s*=\s*(\[.*)$/)
      if (
        arrayMatch &&
        (arrayMatch[1] === 'dependencies' || section.includes('optional-dependencies'))
      ) {
        if (arrayMatch[2].includes(']')) {
          entries.push(...pythonArrayEntries(arrayMatch[2], section, index + 1))
        } else {
          multilineArray = { source: section, line: index + 1, text: arrayMatch[2] }
        }
      }
      return
    }

    if (isPoetryDependencySection(section)) {
      const dependency = parseTomlDependencyAssignment(trimmed, section, index + 1)
      if (dependency) {
        entries.push(dependency)
      }
    }
  })

  return entries
}

function parsePipfileDependencyEntries(lines: string[]): PythonDependencyEntry[] {
  const entries: PythonDependencyEntry[] = []
  let section = ''

  lines.forEach((line, index) => {
    const trimmed = stripPythonComment(line).trim()
    if (!trimmed) {
      return
    }

    const sectionMatch = trimmed.match(/^\[([^\]]+)\]$/)
    if (sectionMatch) {
      section = sectionMatch[1]
      return
    }

    if (section !== 'packages' && section !== 'dev-packages') {
      return
    }

    const dependency = parseTomlDependencyAssignment(trimmed, `Pipfile ${section}`, index + 1)
    if (dependency) {
      entries.push(dependency)
    }
  })

  return entries
}

function parseTomlDependencyAssignment(
  line: string,
  source: string,
  lineNumber: number
): PythonDependencyEntry | undefined {
  const match = line.match(/^([A-Za-z0-9_.-]+)\s*=\s*(.+)$/)
  if (!match) {
    return undefined
  }

  return {
    source,
    text: `${match[1]} = ${match[2].trim()}`,
    line: lineNumber
  }
}

function pythonArrayEntries(
  arrayText: string,
  source: string,
  fallbackLine: number
): PythonDependencyEntry[] {
  return Array.from(arrayText.matchAll(/["']([^"']+)["']/g), (match) => ({
    source,
    text: match[1],
    line: fallbackLine
  }))
}

function isPoetryDependencySection(section: string): boolean {
  return (
    section === 'tool.poetry.dependencies' ||
    section === 'tool.poetry.dev-dependencies' ||
    /^tool\.poetry\.group\.[^.]+\.dependencies$/.test(section)
  )
}

function stripPythonComment(line: string): string {
  let quote: '"' | "'" | undefined

  for (let index = 0; index < line.length; index += 1) {
    const current = line[index]
    const previous = line[index - 1]

    if ((current === '"' || current === "'") && previous !== '\\') {
      quote = quote === current ? undefined : current
      continue
    }

    if (!quote && current === '#') {
      const previousCharacter = line[index - 1]
      if (!previousCharacter || /\s/.test(previousCharacter)) {
        return line.slice(0, index)
      }
    }
  }

  return line
}

function isRequirementsOptionOnly(requirement: string): boolean {
  return (
    /^(-r|--requirement|-c|--constraint)(?:\s|=)/.test(requirement) ||
    /^--(?:index-url|extra-index-url|find-links|trusted-host|no-index|pre)(?:\s|=|$)/.test(
      requirement
    )
  )
}

function isPythonGitDependency(requirement: string): boolean {
  return (
    isGitReference(requirement) ||
    /\bgit\+/.test(requirement) ||
    /\bgit\s*=/.test(requirement) ||
    /\bvcs\s*=\s*["']git["']/.test(requirement)
  )
}

function isHashableRequirement(requirement: string): boolean {
  return (
    !/^(-e|--editable)(?:\s|=)/.test(requirement) &&
    !isPythonGitDependency(requirement) &&
    !/\s@\s*(?:https?:|file:|git\+)/.test(requirement) &&
    /[<>=~!]=/.test(requirement)
  )
}

function isExactPythonRequirement(requirement: string): boolean {
  return /(^|[A-Za-z0-9_.\]-])==[^=]/.test(requirement)
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

  for (const directive of parseGoModDirectives(context.lines)) {
    if (
      directive.keyword === 'replace' &&
      isGitReference(directive.text) &&
      !hasCommitReference(directive.text) &&
      !hasGoPseudoVersion(directive.text)
    ) {
      findings.push(
        finding(
          'go/git-replace-sha',
          'go',
          context.file,
          directive.line,
          'medium',
          `Go replace directive '${directive.text}' does not pin a commit SHA.`,
          'Use immutable pseudo-versions or commit SHA refs for git replacements.'
        )
      )
    }
  }

  return findings
}

function parseGoModDirectives(lines: string[]): GoDirective[] {
  const directives: GoDirective[] = []
  let blockKeyword: string | undefined

  lines.forEach((line, index) => {
    const stripped = stripGoModComment(line).trim()
    if (!stripped) {
      return
    }

    if (blockKeyword) {
      if (stripped === ')') {
        blockKeyword = undefined
        return
      }

      directives.push({
        keyword: blockKeyword,
        text: `${blockKeyword} ${stripped}`,
        line: index + 1
      })
      return
    }

    const blockMatch = stripped.match(/^(require|replace|exclude)\s*\($/)
    if (blockMatch) {
      blockKeyword = blockMatch[1]
      return
    }

    const directiveMatch = stripped.match(
      /^(module|go|toolchain|require|replace|exclude|retract)\b(.*)$/
    )
    if (directiveMatch) {
      directives.push({
        keyword: directiveMatch[1],
        text: stripped,
        line: index + 1
      })
    }
  })

  return directives
}

function stripGoModComment(line: string): string {
  let quote: '"' | undefined

  for (let index = 0; index < line.length; index += 1) {
    const current = line[index]
    const previous = line[index - 1]

    if (current === '"' && previous !== '\\') {
      quote = quote ? undefined : '"'
      continue
    }

    if (!quote && current === '/' && line[index + 1] === '/') {
      return line.slice(0, index)
    }
  }

  return line
}

function hasGoPseudoVersion(value: string): boolean {
  return /\bv\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?-\d{14}-[a-f0-9]{12}\b/i.test(value)
}

function checkRust(context: FileContext): Finding[] {
  if (isRustToolchainFile(context.file)) {
    return checkRustToolchain(context)
  }

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

  for (const dependency of parseRustDependencyEntries(context.lines)) {
    if (
      /\bgit\s*=/.test(dependency.text) &&
      !/\brev\s*=\s*["'][a-f0-9]{40}["']/i.test(dependency.text)
    ) {
      const suggestion = rustRevSuggestion(context.file, dependency)
      findings.push(
        finding(
          'rust/git-rev-sha',
          'rust',
          context.file,
          dependency.line,
          'high',
          `Rust git dependency '${dependency.text}' does not pin a rev commit SHA.`,
          'Add rev = "<40-character commit SHA>" to git dependencies.',
          suggestion
        )
      )
    }
  }

  return findings
}

function checkRustToolchain(context: FileContext): Finding[] {
  const channel =
    parseRustToolchainTomlChannel(context.lines) ??
    (isLegacyRustToolchainFile(context.file)
      ? parseLegacyRustToolchainChannel(context.lines)
      : undefined)

  if (!channel || !isFloatingRustToolchainChannel(channel.value)) {
    return []
  }

  return [
    finding(
      'rust/toolchain-version',
      'rust',
      context.file,
      channel.line,
      'medium',
      `Rust toolchain channel '${channel.value}' can change over time.`,
      'Pin the Rust toolchain to an exact version such as "1.78.0" or a dated channel such as "nightly-2024-05-01".'
    )
  ]
}

function parseRustToolchainTomlChannel(
  lines: string[]
): { value: string; line: number } | undefined {
  let section = ''

  for (let index = 0; index < lines.length; index += 1) {
    const stripped = stripTomlComment(lines[index]).trim()
    if (!stripped) {
      continue
    }

    const sectionMatch = stripped.match(/^\[([^\]]+)\]$/)
    if (sectionMatch) {
      section = sectionMatch[1].trim()
      continue
    }

    if (section !== 'toolchain') {
      continue
    }

    const assignment = stripped.match(/^channel\s*=\s*(.+)$/)
    if (!assignment) {
      continue
    }

    const value = normalizeTomlScalar(assignment[1])
    return value ? { value, line: index + 1 } : undefined
  }

  return undefined
}

function parseLegacyRustToolchainChannel(
  lines: string[]
): { value: string; line: number } | undefined {
  const entries = lines
    .map((line, index) => ({
      text: stripTomlComment(line).trim(),
      line: index + 1
    }))
    .filter((entry) => entry.text.length > 0)

  if (entries.length !== 1 || entries[0].text.startsWith('[') || entries[0].text.includes('=')) {
    return undefined
  }

  const value = normalizeTomlScalar(entries[0].text)
  return value ? { value, line: entries[0].line } : undefined
}

function normalizeTomlScalar(value: string): string | undefined {
  const trimmed = value.trim().replace(/,$/, '').trim()
  const quoted = trimmed.match(/^(['"])(.*)\1$/)
  if (quoted) {
    return quoted[2].trim()
  }

  return /^[A-Za-z0-9_.+-]+$/.test(trimmed) ? trimmed : undefined
}

function isFloatingRustToolchainChannel(value: string): boolean {
  const normalized = value.trim().toLowerCase()
  const channel = normalized.match(/^(stable|beta|nightly)(?:-(.+))?$/)
  if (!channel) {
    return false
  }

  const qualifier = channel[2]
  return !qualifier || !/^\d{4}-\d{2}-\d{2}(?:-.+)?$/.test(qualifier)
}

function parseRustDependencyEntries(lines: string[]): RustDependencyEntry[] {
  const entries: RustDependencyEntry[] = []
  let section = ''
  let active:
    | {
        name: string
        text: string
        line: number
        braceDepth: number
      }
    | undefined
  let activeSubtable: RustDependencyEntry | undefined

  function finishSubtable(): void {
    if (activeSubtable) {
      entries.push(activeSubtable)
      activeSubtable = undefined
    }
  }

  lines.forEach((line, index) => {
    const stripped = stripTomlComment(line).trim()
    if (!stripped) {
      return
    }

    const sectionMatch = stripped.match(/^\[([^\]]+)\]$/)
    if (sectionMatch && !active) {
      finishSubtable()
      section = sectionMatch[1]
      if (isRustDependencySubtable(section)) {
        activeSubtable = {
          name: rustDependencySubtableName(section),
          text: '',
          line: index + 1
        }
      }
      return
    }

    if (active) {
      active.text = `${active.text} ${stripped}`.replace(/\s+/g, ' ')
      active.braceDepth += braceDelta(stripped)
      if (active.braceDepth <= 0) {
        entries.push({
          name: active.name,
          text: active.text,
          line: active.line
        })
        active = undefined
      }
      return
    }

    if (activeSubtable) {
      activeSubtable.text = `${activeSubtable.text} ${stripped}`.trim().replace(/\s+/g, ' ')
      if (/^git\s*=/.test(stripped)) {
        activeSubtable.line = index + 1
      }
      return
    }

    if (!isRustDependencySection(section)) {
      return
    }

    const assignment = stripped.match(/^("[^"]+"|'[^']+'|[A-Za-z0-9_.-]+)\s*=\s*(.+)$/)
    if (!assignment) {
      return
    }

    const text = stripped.replace(/\s+/g, ' ')
    const depth = braceDelta(stripped)
    if (depth > 0) {
      active = {
        name: assignment[1],
        text,
        line: index + 1,
        braceDepth: depth
      }
      return
    }

    entries.push({
      name: assignment[1],
      text,
      line: index + 1,
      lineText: line
    })
  })

  finishSubtable()
  return entries
}

function rustRevSuggestion(
  file: string,
  dependency: RustDependencyEntry
): Finding['suggestion'] | undefined {
  if (!dependency.lineText || dependency.text.includes('#')) {
    return undefined
  }

  const sha = /(?:[?&]rev=|#)([a-f0-9]{40})/i.exec(dependency.text)?.[1]
  if (!sha || !/}\s*$/.test(dependency.lineText)) {
    return undefined
  }

  const newText = dependency.lineText.replace(/\s*}\s*$/, `, rev = "${sha}" }`)
  if (newText === dependency.lineText) {
    return undefined
  }

  return {
    title: `Add explicit Cargo rev '${sha}' from the existing git URL.`,
    confidence: 'high',
    safeToApply: true,
    replacement: {
      file,
      line: dependency.line,
      oldText: dependency.lineText,
      newText
    }
  }
}

function isRustDependencySection(section: string): boolean {
  const path = splitTomlDottedPath(section)
  if (!path) {
    return false
  }

  return (
    isRustDependencyRoot(path[0]) ||
    (path[0] === 'workspace' && path[1] === 'dependencies' && path.length === 2) ||
    (path[0] === 'target' && path.length >= 3 && isRustDependencyRoot(path[path.length - 1])) ||
    (path[0] === 'patch' && path.length === 2) ||
    (path[0] === 'replace' && path.length === 1)
  )
}

function isRustDependencySubtable(section: string): boolean {
  const path = splitTomlDottedPath(section)
  if (!path) {
    return false
  }

  return (
    (isRustDependencyRoot(path[0]) && path.length >= 2) ||
    (path[0] === 'workspace' && path[1] === 'dependencies' && path.length >= 3) ||
    (path[0] === 'target' && path.length >= 4 && isRustDependencyRoot(path[path.length - 2])) ||
    (path[0] === 'patch' && path.length >= 3)
  )
}

function isRustDependencyRoot(segment: string | undefined): boolean {
  return (
    segment === 'dependencies' || segment === 'dev-dependencies' || segment === 'build-dependencies'
  )
}

function rustDependencySubtableName(section: string): string {
  const path = splitTomlDottedPath(section)
  return path?.[path.length - 1] ?? section.slice(section.lastIndexOf('.') + 1)
}

function splitTomlDottedPath(section: string): string[] | undefined {
  const segments: string[] = []
  let current = ''
  let quote: '"' | "'" | undefined
  let escaped = false

  for (let index = 0; index < section.length; index += 1) {
    const character = section[index]

    if (quote) {
      if (escaped) {
        current += character
        escaped = false
        continue
      }

      if (quote === '"' && character === '\\') {
        escaped = true
        continue
      }

      if (character === quote) {
        quote = undefined
        continue
      }

      current += character
      continue
    }

    if (character === '"' || character === "'") {
      quote = character
      continue
    }

    if (character === '.') {
      if (!current) {
        return undefined
      }
      segments.push(current)
      current = ''
      continue
    }

    if (/\s/.test(character)) {
      continue
    }

    current += character
  }

  if (quote || escaped || !current) {
    return undefined
  }

  segments.push(current)
  return segments
}

function stripTomlComment(line: string): string {
  let quote: '"' | "'" | undefined

  for (let index = 0; index < line.length; index += 1) {
    const current = line[index]
    const previous = line[index - 1]

    if ((current === '"' || current === "'") && previous !== '\\') {
      quote = quote === current ? undefined : current
      continue
    }

    if (!quote && current === '#') {
      return line.slice(0, index)
    }
  }

  return line
}

function checkJvm(context: FileContext): Finding[] {
  if (!/(pom\.xml|build\.gradle|build\.gradle\.kts)$/.test(context.file)) {
    return []
  }

  const entries = context.file.endsWith('pom.xml')
    ? parseMavenDynamicVersionEntries(context)
    : parseGradleDynamicVersionEntries(context)
  const gradleMetadataSatisfiesPolicy =
    !context.file.endsWith('pom.xml') &&
    ecosystemBoolean(context.config, 'jvm', 'allowDynamicVersionsWithGradleMetadata', true) &&
    hasGradleLockOrVerificationMetadata(context)

  if (gradleMetadataSatisfiesPolicy) {
    return []
  }

  return entries.map((entry) =>
    finding(
      'jvm/dynamic-version',
      'jvm',
      context.file,
      entry.line,
      'medium',
      `${entry.source === 'maven' ? 'Maven' : 'Gradle'} version declaration '${entry.text}' resolves to dynamic version '${entry.version}'.`,
      entry.source === 'gradle'
        ? 'Use fixed release versions or commit Gradle dependency locking or verification metadata.'
        : 'Use fixed release versions for Maven dependency, parent, plugin, and version-property declarations.'
    )
  )
}

function parseMavenDynamicVersionEntries(context: FileContext): JvmVersionEntry[] {
  const content = stripXmlComments(context.content)
  const propertyReferences = new Set<string>()
  const entries: JvmVersionEntry[] = []

  for (const block of matchXmlBlocks(content, ['dependency', 'parent', 'plugin'])) {
    for (const versionTag of matchXmlChildText(block.text, 'version')) {
      const version = normalizeXmlText(versionTag.value)
      collectMavenPropertyReferences(version).forEach((property) =>
        propertyReferences.add(property)
      )
      if (isJvmDynamicVersion(version)) {
        entries.push({
          source: 'maven',
          text: versionTag.text,
          version,
          line: lineNumberAt(content, block.index + versionTag.index)
        })
      }
    }
  }

  for (const propertiesBlock of matchXmlBlocks(content, ['properties'])) {
    const bodyStart = propertiesBlock.text.indexOf('>') + 1
    const body = propertiesBlock.text.slice(bodyStart, propertiesBlock.text.lastIndexOf('</'))
    for (const property of matchXmlProperties(body)) {
      const version = normalizeXmlText(property.value)
      if (propertyReferences.has(property.name) && isJvmDynamicVersion(version)) {
        entries.push({
          source: 'maven',
          text: property.text,
          version,
          line: lineNumberAt(content, propertiesBlock.index + bodyStart + property.index)
        })
      }
    }
  }

  return dedupeJvmEntries(entries)
}

function parseGradleDynamicVersionEntries(context: FileContext): JvmVersionEntry[] {
  return stripGradleComments(context.content)
    .split(/\r?\n/)
    .flatMap((line, index) => parseGradleLineVersions(line, index + 1))
    .filter((entry) => isJvmDynamicVersion(entry.version))
}

function parseGradleLineVersions(line: string, lineNumber: number): JvmVersionEntry[] {
  const trimmed = line.trim()
  if (!isGradleDependencyOrPluginDeclaration(trimmed)) {
    return []
  }

  const entries: JvmVersionEntry[] = []
  const quotedValues = Array.from(trimmed.matchAll(/['"]([^'"]+)['"]/g), (match) => match[1])
  for (const value of quotedValues) {
    const version = extractGradleCoordinateVersion(value)
    if (version) {
      entries.push({
        source: 'gradle',
        text: trimmed,
        version,
        line: lineNumber
      })
    }
  }

  for (const match of trimmed.matchAll(/\bversion\s*[:=]\s*['"]([^'"]+)['"]/g)) {
    entries.push({
      source: 'gradle',
      text: trimmed,
      version: match[1],
      line: lineNumber
    })
  }

  const pluginVersion = /\bversion\s+['"]([^'"]+)['"]/.exec(trimmed)?.[1]
  if (pluginVersion) {
    entries.push({
      source: 'gradle',
      text: trimmed,
      version: pluginVersion,
      line: lineNumber
    })
  }

  return dedupeJvmEntries(entries)
}

function isGradleDependencyOrPluginDeclaration(line: string): boolean {
  return (
    /^(api|annotationProcessor|classpath|compile|compileOnly|debugImplementation|detachedConfiguration|implementation|kapt|ksp|runtime|runtimeOnly|testAnnotationProcessor|testCompile|testImplementation|testRuntime|testRuntimeOnly)\b/.test(
      line
    ) ||
    /^(add|constraints|enforcedPlatform|platform)\s*\(/.test(line) ||
    /^id\s*(?:\(|['"])/.test(line)
  )
}

function extractGradleCoordinateVersion(value: string): string | undefined {
  const parts = value.split(':')
  if (parts.length < 3) {
    return undefined
  }

  return parts[parts.length - 1]
}

function isJvmDynamicVersion(version: string): boolean {
  const trimmed = version.trim()
  return (
    /\bSNAPSHOT\b/i.test(trimmed) ||
    /^latest(?:[.-][\w-]+)?$/i.test(trimmed) ||
    /\+$/.test(trimmed) ||
    /^[[(][^,]*,[^\])]*[\])]$/.test(trimmed)
  )
}

function stripXmlComments(content: string): string {
  return content.replace(/<!--[\s\S]*?-->/g, (comment) => comment.replace(/[^\r\n]/g, ' '))
}

function matchXmlBlocks(content: string, names: string[]): Array<{ text: string; index: number }> {
  return names.flatMap((name) =>
    Array.from(
      content.matchAll(new RegExp(`<${name}\\b[^>]*>[\\s\\S]*?<\\/${name}>`, 'gi')),
      (match) => ({
        text: match[0],
        index: match.index ?? 0
      })
    )
  )
}

function matchXmlChildText(
  content: string,
  name: string
): Array<{ text: string; value: string; index: number }> {
  return Array.from(
    content.matchAll(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)<\\/${name}>`, 'gi')),
    (match) => ({
      text: match[0].trim(),
      value: match[1],
      index: match.index ?? 0
    })
  )
}

function matchXmlProperties(content: string): Array<{
  name: string
  text: string
  value: string
  index: number
}> {
  return Array.from(content.matchAll(/<([A-Za-z0-9_.-]+)\b[^>]*>([\s\S]*?)<\/\1>/g), (match) => ({
    name: match[1],
    text: match[0].trim(),
    value: match[2],
    index: match.index ?? 0
  }))
}

function normalizeXmlText(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function collectMavenPropertyReferences(value: string): string[] {
  return Array.from(value.matchAll(/\$\{([^}]+)\}/g), (match) => match[1])
}

function stripGradleComments(content: string): string {
  let result = ''
  let quote: '"' | "'" | undefined
  let lineComment = false
  let blockComment = false

  for (let index = 0; index < content.length; index += 1) {
    const current = content[index]
    const next = content[index + 1]
    const previous = content[index - 1]

    if (lineComment) {
      if (current === '\n' || current === '\r') {
        lineComment = false
        result += current
      } else {
        result += ' '
      }
      continue
    }

    if (blockComment) {
      if (current === '*' && next === '/') {
        result += '  '
        blockComment = false
        index += 1
      } else {
        result += current === '\n' || current === '\r' ? current : ' '
      }
      continue
    }

    if (!quote && current === '/' && next === '/') {
      result += '  '
      lineComment = true
      index += 1
      continue
    }

    if (!quote && current === '/' && next === '*') {
      result += '  '
      blockComment = true
      index += 1
      continue
    }

    if ((current === '"' || current === "'") && previous !== '\\') {
      quote = quote === current ? undefined : current
    }

    result += current
  }

  return result
}

function hasGradleLockOrVerificationMetadata(context: FileContext): boolean {
  let current = path.dirname(context.absolutePath)
  const root = path.resolve(context.root)

  while (isPathWithinOrEqual(root, current)) {
    if (
      fs.existsSync(path.join(current, 'gradle.lockfile')) ||
      fs.existsSync(path.join(current, 'gradle', 'verification-metadata.xml')) ||
      directoryHasFiles(path.join(current, 'gradle', 'dependency-locks'))
    ) {
      return true
    }

    const parent = path.dirname(current)
    if (parent === current) {
      break
    }
    current = parent
  }

  return false
}

function directoryHasFiles(directory: string): boolean {
  try {
    return fs.existsSync(directory) && fs.readdirSync(directory).length > 0
  } catch {
    return false
  }
}

function isPathWithinOrEqual(parent: string, child: string): boolean {
  const relative = path.relative(parent, child)
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

function lineNumberAt(content: string, index: number): number {
  return content.slice(0, index).split(/\r?\n/).length
}

function dedupeJvmEntries(entries: JvmVersionEntry[]): JvmVersionEntry[] {
  const seen = new Set<string>()
  return entries.filter((entry) => {
    const key = `${entry.line}:${entry.version}:${entry.text}`
    if (seen.has(key)) {
      return false
    }
    seen.add(key)
    return true
  })
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

  for (const gem of parseRubyGemEntries(context.lines)) {
    if (rubyGemHasGitSource(gem.text) && !rubyGemHasPinnedRef(gem.text)) {
      findings.push(
        finding(
          'ruby/git-ref-sha',
          'ruby',
          context.file,
          gem.line,
          'high',
          `Ruby git dependency '${gem.text}' does not pin a ref commit SHA.`,
          'Add ref: "<40-character commit SHA>" to git dependencies.'
        )
      )
    }
  }

  return findings
}

function rubyGemHasGitSource(text: string): boolean {
  return /(?:\bgit:|:git\s*=>)/.test(text)
}

function rubyGemHasPinnedRef(text: string): boolean {
  return /(?:\bref:\s*|:ref\s*=>\s*)['"][a-f0-9]{40}['"]/i.test(text)
}

function parseRubyGemEntries(lines: string[]): RubyGemEntry[] {
  const entries: RubyGemEntry[] = []
  let active:
    | {
        text: string
        line: number
        nestingDepth: number
      }
    | undefined

  lines.forEach((line, index) => {
    const stripped = stripRubyComment(line).trim()
    if (!stripped) {
      return
    }

    if (active) {
      active.text = `${active.text} ${stripped}`.replace(/\s+/g, ' ')
      active.nestingDepth += nestingDelta(stripped)
      if (active.nestingDepth <= 0 && !continuesRubyGemEntry(stripped)) {
        entries.push({
          text: active.text,
          line: active.line
        })
        active = undefined
      }
      return
    }

    if (!/^gem(?:\s+|\()/.test(stripped)) {
      return
    }

    const nestingDepth = nestingDelta(stripped)
    if (nestingDepth > 0 || continuesRubyGemEntry(stripped)) {
      active = {
        text: stripped,
        line: index + 1,
        nestingDepth
      }
      return
    }

    entries.push({
      text: stripped,
      line: index + 1
    })
  })

  if (active) {
    entries.push({
      text: active.text,
      line: active.line
    })
  }

  return entries
}

function stripRubyComment(line: string): string {
  let quote: '"' | "'" | undefined

  for (let index = 0; index < line.length; index += 1) {
    const current = line[index]
    const previous = line[index - 1]

    if ((current === '"' || current === "'") && previous !== '\\') {
      quote = quote === current ? undefined : current
      continue
    }

    if (!quote && current === '#') {
      return line.slice(0, index)
    }
  }

  return line
}

function continuesRubyGemEntry(line: string): boolean {
  return /(?:,|\\)\s*$/.test(line)
}

function nestingDelta(line: string): number {
  let quote: '"' | "'" | undefined
  let delta = 0

  for (let index = 0; index < line.length; index += 1) {
    const current = line[index]
    const previous = line[index - 1]

    if ((current === '"' || current === "'") && previous !== '\\') {
      quote = quote === current ? undefined : current
      continue
    }

    if (quote) {
      continue
    }

    if (current === '(' || current === '{' || current === '[') {
      delta += 1
    } else if (current === ')' || current === '}' || current === ']') {
      delta -= 1
    }
  }

  return delta
}

function isWorkflowOrActionFile(file: string): boolean {
  return file.startsWith('.github/workflows/') || /^action\.ya?ml$/i.test(file)
}

function isRustToolchainFile(file: string): boolean {
  return file.endsWith('rust-toolchain.toml') || isLegacyRustToolchainFile(file)
}

function isLegacyRustToolchainFile(file: string): boolean {
  return file === 'rust-toolchain' || file.endsWith('/rust-toolchain')
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

function collectGithubActionsRunnerReferences(
  document: unknown,
  lines: string[]
): GithubActionsRunnerReference[] {
  if (!isRecord(document) || !isRecord(document.jobs)) {
    return []
  }

  return Object.values(document.jobs).flatMap((job) => {
    if (!isRecord(job)) {
      return []
    }

    return collectJobRunnerReferences(job, lines)
  })
}

function collectJobRunnerReferences(
  job: Record<string, unknown>,
  lines: string[]
): GithubActionsRunnerReference[] {
  const runsOn = job['runs-on']

  if (typeof runsOn === 'string') {
    const matrixAxis = matrixAxisFromRunsOn(runsOn)
    if (matrixAxis) {
      return collectMatrixRunnerReferences(job, matrixAxis, lines)
    }

    return [
      {
        label: runsOn,
        line: lineForYamlScalar(lines, 'runs-on', runsOn)
      }
    ]
  }

  if (Array.isArray(runsOn)) {
    return runsOn.flatMap((label) =>
      typeof label === 'string'
        ? [
            {
              label,
              line: lineForYamlArrayValue(lines, 'runs-on', label)
            }
          ]
        : []
    )
  }

  return []
}

function collectMatrixRunnerReferences(
  job: Record<string, unknown>,
  axis: string,
  lines: string[]
): GithubActionsRunnerReference[] {
  if (!isRecord(job.strategy) || !isRecord(job.strategy.matrix)) {
    return []
  }

  const references: GithubActionsRunnerReference[] = []
  const axisValues = job.strategy.matrix[axis]
  if (typeof axisValues === 'string') {
    references.push({
      label: axisValues,
      line: lineForYamlValue(lines, axis, axisValues)
    })
  } else if (Array.isArray(axisValues)) {
    references.push(
      ...axisValues.flatMap((label) =>
        typeof label === 'string'
          ? [
              {
                label,
                line: lineForYamlArrayValue(lines, axis, label)
              }
            ]
          : []
      )
    )
  }

  const include = job.strategy.matrix.include
  if (Array.isArray(include)) {
    references.push(
      ...include.flatMap((entry) => {
        if (!isRecord(entry) || typeof entry[axis] !== 'string') {
          return []
        }

        return [
          {
            label: entry[axis],
            line: lineForYamlValue(lines, axis, entry[axis])
          }
        ]
      })
    )
  }

  return references
}

function matrixAxisFromRunsOn(runsOn: string): string | undefined {
  return runsOn.match(/^\s*\$\{\{\s*matrix\.([A-Za-z_][A-Za-z0-9_-]*)\s*\}\}\s*$/)?.[1]
}

function isFloatingGithubHostedRunnerLabel(label: string): boolean {
  return /^(ubuntu|windows|macos)-latest$/.test(label.trim())
}

function parseFallbackRunsOnLabels(value: string): string[] {
  const withoutComment = value.replace(/\s+#.*$/, '').trim()
  if (!withoutComment || withoutComment.includes('${{')) {
    return []
  }

  if (withoutComment.startsWith('[') && withoutComment.endsWith(']')) {
    return withoutComment
      .slice(1, -1)
      .split(',')
      .map((entry) => unquoteYamlScalar(entry.trim()))
      .filter(Boolean)
  }

  return [unquoteYamlScalar(withoutComment)].filter(Boolean)
}

function unquoteYamlScalar(value: string): string {
  return value.replace(/^['"]|['"]$/g, '').trim()
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

function nodeDependencyEntries(
  json: Record<string, unknown>,
  lines: string[]
): NodeDependencyEntry[] {
  const entries: NodeDependencyEntry[] = []
  const dependencySectionNames = [
    'dependencies',
    'devDependencies',
    'peerDependencies',
    'optionalDependencies',
    'bundledDependencies',
    'bundleDependencies'
  ]

  for (const section of dependencySectionNames) {
    const dependencies = json[section]
    if (!isRecord(dependencies)) {
      continue
    }

    for (const [name, spec] of Object.entries(dependencies)) {
      if (typeof spec === 'string') {
        entries.push({
          section,
          name,
          spec,
          line: lineForJsonProperty(lines, name, spec)
        })
      }
    }
  }

  entries.push(...collectNodeOverrideEntries(json.overrides, 'overrides', lines))
  entries.push(...collectNodeOverrideEntries(json.resolutions, 'resolutions', lines))

  if (typeof json.packageManager === 'string') {
    entries.push({
      section: 'packageManager',
      name: 'packageManager',
      spec: json.packageManager,
      line: lineForJsonProperty(lines, 'packageManager', json.packageManager)
    })
  }

  return entries
}

function collectNodeOverrideEntries(
  value: unknown,
  section: string,
  lines: string[],
  parentName?: string
): NodeDependencyEntry[] {
  if (typeof value === 'string' && parentName) {
    return [
      {
        section,
        name: parentName,
        spec: value,
        line: lineForJsonProperty(lines, parentName, value)
      }
    ]
  }

  if (!isRecord(value)) {
    return []
  }

  return Object.entries(value).flatMap(([name, nested]) => {
    const dependencyName = name === '.' && parentName ? parentName : name
    if (typeof nested === 'string') {
      return [
        {
          section,
          name: dependencyName,
          spec: nested,
          line: lineForJsonProperty(lines, name, nested)
        }
      ]
    }

    return collectNodeOverrideEntries(nested, section, lines, dependencyName)
  })
}

function isNodeSpecDeterministic(rawSpec: string): boolean {
  const spec = rawSpec.trim()
  if (/^(workspace:|file:|link:|portal:|patch:)/.test(spec)) {
    return true
  }
  if (isNodePackageManagerSpec(spec)) {
    return isExactVersion(spec.slice(spec.lastIndexOf('@') + 1))
  }
  if (isNodeAliasSpec(spec)) {
    const aliasedSpec = spec.slice(spec.lastIndexOf('@') + 1)
    return isExactVersion(aliasedSpec)
  }
  if (isNodeGitSpec(spec)) {
    return hasNodeCommitReference(spec)
  }
  if (/^https?:/.test(spec)) {
    return hasContentAddressedUrlReference(spec)
  }
  if (/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:#[^#]+)?$/.test(spec)) {
    return hasNodeCommitReference(spec)
  }
  return isExactVersion(spec)
}

function hasNodeCommitReference(value: string): boolean {
  return /#[a-f0-9]{40}$/i.test(value.trim())
}

function isNodeRegistryVersionSpec(spec: string): boolean {
  const trimmed = spec.trim()
  return (
    !/^(git\+|git:|github:|https?:|ssh:|file:|workspace:|link:|portal:|patch:)/.test(trimmed) &&
    !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:#[^#]+)?$/.test(trimmed)
  )
}

function isNodePackageManagerSpec(spec: string): boolean {
  return /^(npm|yarn|pnpm)@/.test(spec)
}

function isNodeAliasSpec(spec: string): boolean {
  return /^npm:[^@]+@/.test(spec) || /^npm:@[^/]+\/[^@]+@/.test(spec)
}

function isNodeGitSpec(spec: string): boolean {
  return /^(git\+|git:|ssh:|github:)/.test(spec) || isGitReference(spec)
}

function hasContentAddressedUrlReference(spec: string): boolean {
  return (
    DIGEST_PATTERN.test(spec) ||
    /(?:sha256|sha512)[-=][A-Za-z0-9+/=_-]{32,}/i.test(spec) ||
    /[?#&](?:checksum|integrity|hash)=/.test(spec)
  )
}

function readNodeLockfiles(directory: string): NodeLockfile[] {
  const lockfiles: NodeLockfile[] = []
  for (const name of ['package-lock.json', 'npm-shrinkwrap.json']) {
    const absolutePath = path.join(directory, name)
    if (fs.existsSync(absolutePath)) {
      lockfiles.push(parseNpmLockfile(absolutePath))
    }
  }

  const yarnLock = path.join(directory, 'yarn.lock')
  if (fs.existsSync(yarnLock)) {
    lockfiles.push(parseYarnLockfile(yarnLock))
  }

  const pnpmLock = path.join(directory, 'pnpm-lock.yaml')
  if (fs.existsSync(pnpmLock)) {
    lockfiles.push(parsePnpmLockfile(pnpmLock))
  }

  return lockfiles
}

function parseNpmLockfile(absolutePath: string): NodeLockfile {
  const lockfile: NodeLockfile = {
    type: 'npm',
    path: absolutePath,
    dependencies: new Set(),
    specs: new Set(),
    integrityDependencies: new Set()
  }
  const json = safeJson(fs.readFileSync(absolutePath, 'utf8'))
  if (!json) {
    return lockfile
  }

  const packages = json.packages
  if (isRecord(packages)) {
    for (const [packagePath, metadata] of Object.entries(packages)) {
      if (!isRecord(metadata) || packagePath === '') {
        continue
      }

      const packageName = nodePackageNameFromPath(packagePath)
      if (packageName) {
        lockfile.dependencies.add(packageName)
      }
      if (typeof metadata.integrity === 'string' && packageName) {
        lockfile.integrityDependencies.add(packageName)
      }
      if (typeof metadata.version === 'string' && packageName) {
        lockfile.specs.add(`${packageName}@${metadata.version}`)
      }
    }
  }

  collectNpmDependencyEntries(json.dependencies, lockfile)
  return lockfile
}

function collectNpmDependencyEntries(value: unknown, lockfile: NodeLockfile): void {
  if (!isRecord(value)) {
    return
  }

  for (const [name, metadata] of Object.entries(value)) {
    lockfile.dependencies.add(name)
    if (isRecord(metadata)) {
      if (typeof metadata.integrity === 'string') {
        lockfile.integrityDependencies.add(name)
      }
      if (typeof metadata.version === 'string') {
        lockfile.specs.add(`${name}@${metadata.version}`)
      }
      collectNpmDependencyEntries(metadata.dependencies, lockfile)
    }
  }
}

function parseYarnLockfile(absolutePath: string): NodeLockfile {
  const content = fs.readFileSync(absolutePath, 'utf8')
  const lockfile: NodeLockfile = {
    type: 'yarn',
    path: absolutePath,
    dependencies: new Set(),
    specs: new Set(),
    integrityDependencies: new Set()
  }

  let activeDependencies: string[] = []
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^"?(@?[^",:\s]+)@([^",:\s]+)"?(?:,.*)?:\s*$/)
    if (match) {
      activeDependencies = [match[1]]
      lockfile.dependencies.add(match[1])
      lockfile.specs.add(`${match[1]}@${match[2]}`)
      continue
    }

    if (/^\s+(?:integrity\s+|checksum:)/i.test(line)) {
      activeDependencies.forEach((dependency) => lockfile.integrityDependencies.add(dependency))
    }
  }

  for (const match of content.matchAll(/^"?(@?[^",:\s]+)@([^",:\s]+)"?(?:,.*)?:\s*$/gm)) {
    lockfile.dependencies.add(match[1])
    lockfile.specs.add(`${match[1]}@${match[2]}`)
  }

  const parsed = parseYamlDocuments(content)[0]
  if (isRecord(parsed)) {
    for (const [key, metadata] of Object.entries(parsed)) {
      const parsedKey = key.match(/^(@?[^@]+)@(.+)$/)
      if (parsedKey) {
        lockfile.dependencies.add(parsedKey[1])
        lockfile.specs.add(`${parsedKey[1]}@${parsedKey[2]}`)
      }
      if (isRecord(metadata) && (metadata.integrity || metadata.checksum)) {
        if (parsedKey) {
          lockfile.integrityDependencies.add(parsedKey[1])
        }
      }
    }
  }

  return lockfile
}

function parsePnpmLockfile(absolutePath: string): NodeLockfile {
  const lockfile: NodeLockfile = {
    type: 'pnpm',
    path: absolutePath,
    dependencies: new Set(),
    specs: new Set(),
    integrityDependencies: new Set()
  }
  const parsed = parseYamlDocuments(fs.readFileSync(absolutePath, 'utf8'))[0]
  if (!isRecord(parsed)) {
    return lockfile
  }

  collectPnpmDependencySpecs(parsed.importers, lockfile)
  collectPnpmPackageEntries(parsed.packages, lockfile)
  return lockfile
}

function collectPnpmDependencySpecs(value: unknown, lockfile: NodeLockfile): void {
  if (!isRecord(value)) {
    return
  }

  for (const importer of Object.values(value)) {
    if (!isRecord(importer)) {
      continue
    }

    for (const section of ['dependencies', 'devDependencies', 'optionalDependencies']) {
      const dependencies = importer[section]
      if (!isRecord(dependencies)) {
        continue
      }

      for (const [name, metadata] of Object.entries(dependencies)) {
        lockfile.dependencies.add(name)
        if (typeof metadata === 'string') {
          lockfile.specs.add(`${name}@${metadata}`)
        } else if (isRecord(metadata) && typeof metadata.specifier === 'string') {
          lockfile.specs.add(`${name}@${metadata.specifier}`)
        }
      }
    }
  }
}

function collectPnpmPackageEntries(value: unknown, lockfile: NodeLockfile): void {
  if (!isRecord(value)) {
    return
  }

  for (const [key, metadata] of Object.entries(value)) {
    const parsedKey = key.match(/^\/?(@?[^/]+(?:\/[^/]+)?)(?:@|\/)([^/()]+)(?:\(|$)/)
    if (parsedKey) {
      lockfile.dependencies.add(parsedKey[1])
      lockfile.specs.add(`${parsedKey[1]}@${parsedKey[2]}`)
    }
    if (
      parsedKey &&
      isRecord(metadata) &&
      isRecord(metadata.resolution) &&
      metadata.resolution.integrity
    ) {
      lockfile.integrityDependencies.add(parsedKey[1])
    }
  }
}

function hasNodeLockCoverage(entry: NodeDependencyEntry, lockfiles: NodeLockfile[]): boolean {
  if (entry.section === 'packageManager') {
    return true
  }

  const packageName = nodeRegistryPackageName(entry.name, entry.spec)
  const exactSpec = nodeExactRegistrySpec(entry.spec)
  return lockfiles.some((lockfile) => {
    const hasPackage = lockfile.dependencies.has(packageName)
    const hasSpec = exactSpec ? lockfile.specs.has(`${packageName}@${exactSpec}`) : true
    return hasPackage && hasSpec && lockfile.integrityDependencies.has(packageName)
  })
}

function nodeRegistryPackageName(name: string, spec: string): string {
  const aliasMatch = spec.match(/^npm:(@?[^@]+(?:\/[^@]+)?)@/)
  return aliasMatch ? aliasMatch[1] : name
}

function nodeExactRegistrySpec(spec: string): string | undefined {
  const trimmed = spec.trim()
  if (isExactVersion(trimmed)) {
    return trimmed
  }
  const aliasMatch = trimmed.match(/^npm:@?[^@]+(?:\/[^@]+)?@(.+)$/)
  return aliasMatch && isExactVersion(aliasMatch[1]) ? aliasMatch[1] : undefined
}

function nodePackageNameFromPath(packagePath: string): string | undefined {
  const normalized = packagePath.replaceAll('\\', '/')
  const marker = 'node_modules/'
  const index = normalized.lastIndexOf(marker)
  if (index === -1) {
    return undefined
  }

  const parts = normalized.slice(index + marker.length).split('/')
  return parts[0]?.startsWith('@') ? `${parts[0]}/${parts[1]}` : parts[0]
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

function lineForJsonProperty(lines: string[], key: string, value?: string): number {
  const escapedKey = escapeRegExp(JSON.stringify(key).slice(1, -1))
  const escapedValue = value ? escapeRegExp(JSON.stringify(value).slice(1, -1)) : undefined
  const propertyPattern = new RegExp(`"${escapedKey}"\\s*:`)
  const valuePattern = escapedValue ? new RegExp(`:\\s*"${escapedValue}"`) : undefined
  const index = lines.findIndex(
    (line) => propertyPattern.test(line) && (!valuePattern || valuePattern.test(line))
  )
  return index === -1 ? lineForText(lines, `"${key}"`) : index + 1
}

function lineForYamlScalar(lines: string[], key: string, value: string): number {
  const escaped = escapeRegExp(value)
  const pattern = new RegExp(`\\b${escapeRegExp(key)}\\s*:\\s*['"]?${escaped}['"]?\\s*(?:#.*)?$`)
  const index = lines.findIndex((line) => pattern.test(line.trim()))
  return index === -1 ? lineForText(lines, value) : index + 1
}

function lineForYamlValue(lines: string[], key: string, value: string): number {
  const escapedKey = escapeRegExp(key)
  const escapedValue = escapeRegExp(value)
  const keyAndValuePattern = new RegExp(`\\b${escapedKey}\\b.*${escapedValue}`)
  const keyAndValueIndex = lines.findIndex((line) => keyAndValuePattern.test(line.trim()))
  if (keyAndValueIndex !== -1) {
    return keyAndValueIndex + 1
  }

  return lineForYamlScalar(lines, key, value)
}

function lineForYamlArrayValue(lines: string[], key: string, value: string): number {
  const escapedKey = escapeRegExp(key)
  const escapedValue = escapeRegExp(value)
  const inlineArrayPattern = new RegExp(`\\b${escapedKey}\\b.*\\[.*${escapedValue}`)
  const inlineArrayIndex = lines.findIndex((line) => inlineArrayPattern.test(line.trim()))
  if (inlineArrayIndex !== -1) {
    return inlineArrayIndex + 1
  }

  const listItemPattern = new RegExp(`^\\s*-\\s*['"]?${escapedValue}['"]?(?:\\s+#.*)?$`)
  const keyOnlyPattern = new RegExp(`^\\s*${escapedKey}\\s*:\\s*(?:#.*)?$`)
  for (const [keyIndex, line] of lines.entries()) {
    if (!keyOnlyPattern.test(line)) {
      continue
    }

    const keyIndent = line.search(/\S/)
    for (let index = keyIndex + 1; index < lines.length; index += 1) {
      const candidate = lines[index]
      if (!candidate.trim() || candidate.trim().startsWith('#')) {
        continue
      }

      const candidateIndent = candidate.search(/\S/)
      if (candidateIndent <= keyIndent || !/^\s*-/.test(candidate)) {
        break
      }

      if (listItemPattern.test(candidate)) {
        return index + 1
      }
    }
  }

  const listItemIndex = lines.findIndex((line) => listItemPattern.test(line))
  if (listItemIndex !== -1) {
    return listItemIndex + 1
  }

  return lineForYamlValue(lines, key, value)
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

function rule(
  id: string,
  ecosystem: string,
  defaultSeverity: Severity,
  description: string,
  evaluate: RuleHandler
): Rule {
  return {
    id,
    ecosystem,
    defaultSeverity,
    description,
    evaluate
  }
}

function noFileFindings(): Finding[] {
  return []
}

function finding(
  ruleId: string,
  ecosystem: string,
  file: string,
  line: number,
  severity: Severity,
  message: string,
  remediation: string,
  suggestion?: Finding['suggestion']
): Finding {
  return {
    ruleId,
    ecosystem,
    file,
    line,
    severity,
    message,
    remediation,
    suggestion
  }
}
