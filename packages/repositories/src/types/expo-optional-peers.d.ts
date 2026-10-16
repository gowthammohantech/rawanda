/**
 * Minimal type declarations of the optional native peers (`expo-sqlite`, `expo-crypto`) so this
 * package typechecks without installing Expo (the SDK is pinned in FND-11). Only the members the
 * `./expo-sqlite` and `./ids/native` entries use are declared; they match expo-sqlite /
 * expo-crypto for Expo SDK 58 (58.0.13 / 58.0.6). TypeScript prefers these ambient declarations
 * even once the real packages are installed; FND-11 may delete this file to use the real types.
 */
declare module "expo-sqlite" {
  export type SQLiteBindValue = string | number | null | boolean | Uint8Array;
  export interface SQLiteRunResult {
    lastInsertRowId: number;
    changes: number;
  }
  export interface SQLiteDatabase {
    execAsync(source: string): Promise<void>;
    runAsync(source: string, params: SQLiteBindValue[]): Promise<SQLiteRunResult>;
    getAllAsync<T>(source: string, params: SQLiteBindValue[]): Promise<T[]>;
    getFirstAsync<T>(source: string, params: SQLiteBindValue[]): Promise<T | null>;
    withExclusiveTransactionAsync(task: (txn: SQLiteDatabase) => Promise<void>): Promise<void>;
    closeAsync(): Promise<void>;
  }
  export function openDatabaseAsync(databaseName: string): Promise<SQLiteDatabase>;
}

declare module "expo-crypto" {
  export function randomUUID(): string;
}
