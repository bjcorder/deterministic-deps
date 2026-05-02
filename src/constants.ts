export const DEFAULT_INCLUDE = [
  '.github/workflows/**/*.{yml,yaml}',
  'action.{yml,yaml}',
  '**/Dockerfile',
  '**/Dockerfile.*',
  '**/docker-compose*.{yml,yaml}',
  '**/compose*.{yml,yaml}',
  '.devcontainer/devcontainer.json',
  '**/*.tf',
  '**/package.json',
  '**/requirements*.txt',
  '**/pyproject.toml',
  '**/Pipfile',
  '**/go.mod',
  '**/Cargo.toml',
  '**/pom.xml',
  '**/build.gradle',
  '**/build.gradle.kts',
  '**/Gemfile'
]

export const DEFAULT_EXCLUDE = [
  '**/.git/**',
  '**/node_modules/**',
  '**/vendor/**',
  '**/dist/**',
  '**/build/**',
  '**/target/**',
  '**/.terraform/**',
  '**/.venv/**',
  '**/venv/**',
  '**/__pycache__/**'
]

export const SHA_PATTERN = /^[a-f0-9]{40}$/i
export const SHORT_SHA_PATTERN = /^[a-f0-9]{7,39}$/i
export const DIGEST_PATTERN = /@sha256:[a-f0-9]{64}\b/i

export const SEVERITY_ORDER = {
  low: 0,
  medium: 1,
  high: 2
} as const
