import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertRestoreConfirmation,
  buildBackupArgs,
  buildRestoreArgs,
  parsePostgresConnection,
} from './database-maintenance.mjs';

test('parses credentials into environment variables without command arguments', () => {
  const connection = parsePostgresConnection(
    'postgresql://docu%40user:s%23cret@db.example.com:6543/documind?sslmode=require',
  );
  assert.equal(connection.database, 'documind');
  assert.equal(connection.env.PGUSER, 'docu@user');
  assert.equal(connection.env.PGPASSWORD, 's#cret');
  assert.equal(connection.env.PGHOST, 'db.example.com');
  assert.equal(connection.env.PGPORT, '6543');
  assert.ok(
    !buildBackupArgs(connection.database, 'backup.dump')
      .join(' ')
      .includes('s#cret'),
  );
});

test('requires the target database name as restore confirmation', () => {
  assert.throws(
    () => assertRestoreConfirmation('documind', { confirm: true }, 'test'),
    /--confirm=documind/,
  );
  assert.doesNotThrow(() =>
    assertRestoreConfirmation('documind', { confirm: 'documind' }, 'test'),
  );
});

test('requires an additional production restore opt-in', () => {
  assert.throws(
    () =>
      assertRestoreConfirmation(
        'documind',
        { confirm: 'documind' },
        'production',
      ),
    /--allow-production/,
  );
});

test('uses portable custom-format dump and fail-fast restore arguments', () => {
  assert.ok(
    buildBackupArgs('documind', 'backup.dump').includes('--format=custom'),
  );
  const restoreArgs = buildRestoreArgs('documind', 'backup.dump');
  assert.ok(restoreArgs.includes('--clean'));
  assert.ok(restoreArgs.includes('--if-exists'));
  assert.ok(restoreArgs.includes('--exit-on-error'));
});
