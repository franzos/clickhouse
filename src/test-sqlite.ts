import sqlite3, { Database } from "better-sqlite3";
import { createReadStream } from "node:fs";
import { finished } from "node:stream/promises";
import { parse } from "csv-parse";
import { listFiles, queryToSQL, countSQL } from "./utils";
import { FilterOperator, QueryFactory, EarthquakeRecord } from "./types";
import { dataPath, databasePath, tableName } from "./constants";

class DB {
  db: Database | null = null;

  async init() {
    this.db = new sqlite3(databasePath);
    this.db.pragma("journal_mode = WAL");
  }

  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  async tableExists(tableName: string) {
    if (!this.db) {
      throw new Error("Database not ready");
    }

    const result = await this.db
      .prepare(
        `SELECT name FROM sqlite_master WHERE type='table' AND name='${tableName}'`,
      )
      .get();

    return result !== undefined;
  }

  async createTable(tableName: string) {
    if (!this.db) {
      throw new Error("Database not ready");
    }

    return this.db.exec(
      `CREATE TABLE IF NOT EXISTS ${tableName} (
				FF TEXT,
				latitude REAL,
				longitude REAL,
				depth REAL,
				mag REAL,
				magType TEXT,
				nst INTEGER,
				gap INTEGER,
				dmin REAL,
				rms REAL,
				net TEXT,
				id TEXT,
				updated TEXT,
				place TEXT,
				type TEXT,
				horizontalError REAL,
				depthError REAL,
				magError REAL,
				magNst INTEGER,
				status TEXT,
				locationSource TEXT,
				magSource TEXT
			)`,
    );
  }

  async insertRecords(tableName: string, records: EarthquakeRecord[]) {
    if (!this.db) {
      throw new Error("Database not ready");
    }

    let count = 0;
    const stmt = this.db.prepare(
      `INSERT INTO ${tableName} VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    await this.db.transaction((tx) => {
      for (const record of records) {
        stmt.run(
          record.FF,
          record.latitude,
          record.longitude,
          record.depth,
          record.mag,
          record.magType,
          record.nst,
          record.gap,
          record.dmin,
          record.rms,
          record.net,
          record.id,
          record.updated,
          record.place,
          record.type,
          record.horizontalError,
          record.depthError,
          record.magError,
          record.magNst,
          record.status,
          record.locationSource,
          record.magSource,
        );
        count++;
      }
    })(records);
  }

  async populateFromFile(tableName: string, filePath: string) {
    if (!this.db) {
      throw new Error("Database not ready");
    }

    const records: any = [];
    const parser = createReadStream(filePath).pipe(
      parse({ delimiter: ",", columns: true }),
    );
    parser.on("data", (row) => {
      records.push(row);
    });
    parser.on("error", (err) => {
      console.error(err);
    });

    await finished(parser);
    await this.insertRecords(tableName, records);

    console.log(`- ${records.length} records: ${filePath}`);
  }

  async populateFromFiles(tableName: string, dataDir: string) {
    const files = await listFiles(dataDir);
    if (files.length === 0) {
      console.log(`No files found in ${dataDir}`);
      return;
    }
    for (const file of files) {
      await this.populateFromFile(tableName, `${dataPath}/` + file);
    }
  }

  async search(tableName: string, params: QueryFactory) {
    if (!this.db) {
      throw new Error("Database not ready");
    }

    const query = queryToSQL(tableName, params);
    return this.db.prepare(query).all();
  }

  async count(tableName: string, params: QueryFactory) {
    if (!this.db) {
      throw new Error("Database not ready");
    }

    const query = countSQL(tableName, params);
    const result = await this.db.prepare(query).get();
    return (result as any)["COUNT()"];
  }
}

(async () => {
  // Init DB
  const db = new DB();
  await db.init();

  // Create table; add data
  const tableExists = await db.tableExists(tableName);
  if (!tableExists) {
    console.log(`Creating table ${tableName}`);
    const start = Date.now();
    await db.createTable(tableName);
    await db.populateFromFiles(tableName, dataPath);
    console.log(`Populate took ${(Date.now() - start) / 1000} seconds.`);
  } else {
    console.log(`Table ${tableName} already exists`);
  }

  // Search
  const start = Date.now();
  const params = new QueryFactory({
    limit: 10,
    offset: 0,
    filters: [],
  });
  params.addFilter({ key: "mag", opt: FilterOperator.More, value: 1 });
  params.addFilter({ key: "mag", opt: FilterOperator.Less, value: 2 });

  await db.search(tableName, params);
  console.log(`Search took ${(Date.now() - start) / 1000} seconds.`);

  // Count
  const startCount = Date.now();
  const countResult = await db.count(tableName, params);
  console.log(`Total: ${countResult}`);
  console.log(`Count took ${(Date.now() - startCount) / 1000} seconds.`);

  db.close();
})();
