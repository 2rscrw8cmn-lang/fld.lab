import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

describe("Phase 3A training migration", () => {
  const migrationPath = fileURLToPath(new URL("../migrations/0003_training.sql", import.meta.url));
  const migration = readFileSync(migrationPath, "utf8");

  it("creates the session, queue, attempt, and measurement tables", () => {
    expect(migration).toContain("CREATE TABLE training_sessions");
    expect(migration).toContain("CREATE TABLE session_athletes");
    expect(migration).toContain("CREATE TABLE attempts");
    expect(migration).toContain("CREATE TABLE measurements");
  });

  it("snapshots an immutable drill version on the session", () => {
    const sessionTable = migration.split("CREATE TABLE training_sessions (")[1].split("CREATE TABLE session_athletes")[0];
    expect(sessionTable).toContain("drill_version_id TEXT NOT NULL");
    expect(sessionTable).toContain("FOREIGN KEY (drill_version_id) REFERENCES drill_versions(id)");
  });

  it("uses client attempt ids for idempotent persistence", () => {
    const attemptTable = migration.split("CREATE TABLE attempts (")[1].split("CREATE TABLE measurements")[0];
    expect(attemptTable).toContain("client_attempt_id TEXT NOT NULL UNIQUE");
    expect(attemptTable).toContain("UNIQUE (session_id, athlete_id, attempt_number)");
  });

  it("stores splits as measurements instead of a separate split table", () => {
    expect(migration).not.toContain("CREATE TABLE splits");
    expect(migration).toContain("key TEXT NOT NULL");
    expect(migration).toContain("value_numeric REAL");
    expect(migration).toContain("UNIQUE (attempt_id, key)");
  });
});
