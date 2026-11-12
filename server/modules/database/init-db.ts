import { initializeOwnership, registerOwnershipContext } from './ownership.js';
import { getConnection } from "@/modules/database/connection.js";
import { runMigrations } from "@/modules/database/migrations.js";
import { INIT_SCHEMA_SQL } from "@/modules/database/schema.js";
import { initializeAuthSessionTables } from '@/modules/database/repositories/auth-sessions.db.js';

/** Provider workers attach to the schema initialized by the web service.
 * Re-running migrations on every chat needlessly races DDL and ownership
 * updates across processes. Register the connection-local UDF and verify
 * readiness, but leave schema changes to the main service before it listens.
 */
export function initializeWorkerDatabase(): void {
    const db = getConnection();
    registerOwnershipContext(db);
    db.prepare('SELECT session_id, provider_session_id, owner_id, jsonl_path FROM sessions LIMIT 0').all();
    db.prepare('SELECT id, status FROM message_queue LIMIT 0').all();
}

// Initialize database with schema
export const initializeDatabase = async () => {
    try {
        const db = getConnection();
        registerOwnershipContext(db);
        db.exec(INIT_SCHEMA_SQL);
        console.log('Database schema applied');
        runMigrations(db);
        initializeAuthSessionTables(db);
        initializeOwnership(db);
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.log('Database initialization failed', { error: message });
        throw err;
    }
};
