import type { Client } from '@libsql/client';

export const SKIP_TABLES: string[];
export const KEEP_SNAPSHOTS: number;
export function openClient(url: string, authToken?: string): Promise<Client>;
export function previewSkip(env: Record<string, string | undefined>): boolean;
export function splitStatements(sql: string, file?: string): string[];
export function userTables(client: Client): Promise<string[]>;
export function takeSnapshot(client: Client, reason: string): Promise<number>;
export function listSnapshots(client: Client): Promise<{ id: number; created_at: string; reason: string; schema: string; counts: Record<string, number> }[]>;
export function restoreSnapshot(client: Client, id: number): Promise<{ restoredTables: string[]; skipped: string[]; schema: string }>;
export function readMigrations(dir: string): { name: string; sql: string }[];
export function runMigrations(client: Client, dir: string, log?: (m: string) => void): Promise<{ applied: string[]; snapshots: number[] }>;
