# Security Policy

## Supported Versions

Security fixes are provided for the latest released major version.

## Reporting a Vulnerability

Please report suspected vulnerabilities through GitHub private vulnerability reporting. If GitHub private vulnerability reporting is unavailable for your account, contact the maintainer directly.

Do not open a public issue for sensitive reports. Include a minimal reproduction, affected version, and any known impact.

## Scope

`deterministic-deps` performs local static analysis. It should not contact package registries, clone dependencies, or execute dependency code. Bugs that cause unexpected network access, command execution, path traversal, or incorrect CI failure behavior are in scope.
