
const DB_NAME = "piano_app_db";
const DB_VERSION = 1;
const STORE_NAME = "settings";

export class SettingsDB {
    private db: IDBDatabase | null = null;

    async connect(): Promise<IDBDatabase> {
        if (this.db) return this.db;

        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                resolve(this.db);
            };

            request.onupgradeneeded = (e) => {
                const db = (e.target as IDBOpenDBRequest).result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    db.createObjectStore(STORE_NAME);
                }
            };
        });
    }

    async saveKeyMap(keyMap: Record<string, number>) {
        const db = await this.connect();
        return new Promise<void>((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, "readwrite");
            const store = tx.objectStore(STORE_NAME);
            const req = store.put(keyMap, "keyMap");
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
        });
    }

    async loadKeyMap(): Promise<Record<string, number> | null> {
        const db = await this.connect();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, "readonly");
            const store = tx.objectStore(STORE_NAME);
            const req = store.get("keyMap");
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    }

    async saveTranspose(transpose: number) {
        const db = await this.connect();
        return new Promise<void>((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, "readwrite");
            const store = tx.objectStore(STORE_NAME);
            const req = store.put(transpose, "transpose");
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
        });
    }

    async loadTranspose(): Promise<number | null> {
        const db = await this.connect();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, "readonly");
            const store = tx.objectStore(STORE_NAME);
            const req = store.get("transpose");
            req.onsuccess = () => resolve(req.result !== undefined ? req.result : null);
            req.onerror = () => reject(req.error);
        });
    }

    async saveRange(start: number, end: number) {
        const db = await this.connect();
        return new Promise<void>((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, "readwrite");
            const store = tx.objectStore(STORE_NAME);
            const req = store.put({ start, end }, "range");
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
        });
    }

    async loadRange(): Promise<{ start: number; end: number } | null> {
        const db = await this.connect();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, "readonly");
            const store = tx.objectStore(STORE_NAME);
            const req = store.get("range");
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    }
}

export const settingsDB = new SettingsDB();
