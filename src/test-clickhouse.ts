import {
  ClickHouseClient,
  createClient,
  InsertParams,
  QueryParams,
} from "@clickhouse/client";
import { createReadStream } from "node:fs";
import { parse } from "csv-parse";
import { finished } from "node:stream/promises";
import { EarthquakeRecord, FilterOperator, QueryFactory } from "./types";
import { countSQL, defaultZero, listFiles, queryToSQL } from "./utils";
import {
  clickHousePassword,
  clickHouseUsername,
  dataPath,
  tableName,
} from "./constants";

class DB {
  client: ClickHouseClient | null = null;

  async init() {
    this.client = createClient({
      username: clickHouseUsername,
      password: clickHousePassword,
    });
  }

  async close() {
    if (this.client) {
      await this.client.close();
      this.client = null;
    }
  }

  async tableHasRecords(tableName: string) {
    if (!this.client) {
      throw new Error("Database not ready");
    }

    try {
      const result = await this.client.query({
        query: `SELECT * FROM ${tableName} LIMIT 1`,
      });
      const jsonResult: any = await result.json();
      if (jsonResult.data.length > 0) {
        return true;
      }
    } catch (e) {
      return false;
    }
  }

  async createTable(tableName: string) {
    if (!this.client) {
      throw new Error("Database not ready");
    }

    const params: QueryParams = {
      query: `CREATE TABLE IF NOT EXISTS ${tableName} (
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
            ) ENGINE = MergeTree() ORDER BY (id)`,
    };
    return this.client.command(params);
  }

  async insertRecords(tableName: string, records: EarthquakeRecord[]) {
    if (!this.client) {
      throw new Error("Database not ready");
    }

    // ClickHouse is really picky about the format
    // 'gab' kept failing, so I default to 0; won't have any impact on our tests
    const transformedRecords = records.map((record) => {
      return {
        FF: record.FF || "NULL",
        latitude: defaultZero(record.latitude),
        longitude: defaultZero(record.longitude),
        depth: defaultZero(record.depth),
        mag: defaultZero(record.mag),
        magType: record.magType || "NULL",
        nst: defaultZero(record.nst),
        gap: "0",
        dmin: defaultZero(record.dmin),
        rms: defaultZero(record.rms),
        net: record.net || "NULL",
        id: record.id || "NULL",
        updated: record.updated || "NULL",
        place: record.place || "NULL",
        type: record.type || "NULL",
        horizontalError: defaultZero(record.horizontalError),
        depthError: defaultZero(record.depthError),
        magError: defaultZero(record.magError),
        magNst: defaultZero(record.magNst),
        status: record.status || "NULL",
        locationSource: record.locationSource || "NULL",
        magSource: record.magSource || "NULL",
      };
    });

    const params: InsertParams = {
      table: tableName,
      values: transformedRecords,
      format: "JSONEachRow",
    };
    return this.client.insert(params);
  }

  async populateFromFile(tableName: string, filePath: string) {
    if (!this.client) {
      throw new Error("Database not ready");
    }

    const records: EarthquakeRecord[] = [];
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
    if (!this.client) {
      throw new Error("Database not ready");
    }

    const files = await listFiles(dataDir);
    for (const file of files) {
      await this.populateFromFile(tableName, `${dataDir}/${file}`);
    }
  }

  async search(tableName: string, params: QueryFactory) {
    if (!this.client) {
      throw new Error("Database not ready");
    }

    return this.client.query({
      query: queryToSQL(tableName, params),
    });
  }

  async count(tableName: string, params: QueryFactory) {
    if (!this.client) {
      throw new Error("Database not ready");
    }

    const result = await this.client.query({
      query: countSQL(tableName, params),
    });
    const jsonResult: any = await result.json();
    return jsonResult.data[0]["count()"];
  }
}

(async () => {
  const db = new DB();
  await db.init();
  await db.createTable(tableName);

  const tableHasRecords = await db.tableHasRecords(tableName);
  if (!tableHasRecords) {
    console.log(`Populating table ${tableName}`);
    const start = Date.now();
    await db.populateFromFiles(tableName, dataPath);
    console.log(`Populate took ${(Date.now() - start) / 1000} seconds.`);
  } else {
    console.log(`Table ${tableName} already has records.`);
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
