# Testing Guide

## Test Types

### Unit Tests

Unit tests cover pure functions and command handlers. They use dependency injection
for stdout/stderr/exit to run in-process.

### Integration Tests

Integration tests run the CLI as a subprocess to verify end-to-end behavior.
They build the binary once in TestMain and execute it via `exec.Command`.

### E2E Tests

E2E tests use a fixture-based approach with a realistic multi-document workspace.
They verify complex scenarios like cross-document search, tag aggregation, and
relation traversal.

## Writing Tests

Follow these patterns:

1. Use `t.TempDir()` for isolation
2. Use `setupKB()` helper to initialize knowledge bases
3. Verify both stdout JSON and stderr error codes
4. Test edge cases: empty workspace, non-existent paths, concurrent writes

## Test Coverage

Target: 80%+ coverage for `cmd/cli/` package.

See [deployment guide](deployment.md) for CI integration.
