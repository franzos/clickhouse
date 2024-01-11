import { createReadStream } from "node:fs";
import { finished } from "node:stream/promises";
import { parse } from "csv-parse";
import { FilterOperator, Filter, QueryParams, QueryFactory } from "./types";
import { listFiles } from "./utils";
import { dataPath } from "./constants";

const isFilterMatch = (record: any, filter: Filter) => {
  switch (filter.opt) {
    case FilterOperator.Equal:
      return record[filter.key] === filter.value;
    case FilterOperator.NotEqual:
      return record[filter.key] !== filter.value;
    case FilterOperator.Less:
      return record[filter.key] < filter.value;
    case FilterOperator.More:
      return record[filter.key] > filter.value;
    default:
      return false;
  }
};

const isFiltersMatch = (record: any, filters: Filter[]) => {
  let matches = 0;

  for (const filter of filters) {
    if (isFilterMatch(record, filter)) {
      matches++;
    }
  }
  return matches === filters.length;
};

const queryFile = async (filePath: string, query?: QueryParams) => {
  const records: any = [];
  const parser = createReadStream(filePath).pipe(
    parse({ delimiter: ",", columns: true }),
  );
  parser.on("data", (row) => {
    if (!query?.filters || isFiltersMatch(row, query.filters)) {
      records.push(row);
    }
  });
  parser.on("error", (err) => {
    console.error(err);
  });
  parser.on("end", () => {
    console.log(`- ${records.length} records: ${filePath}`);
  });

  await finished(parser);
  return records;
};

const search = async (dataDir: string, params?: QueryParams) => {
  const files = await listFiles(dataDir);
  if (files.length === 0) {
    console.log(`No files found in ${dataDir}.`);
    return;
  }

  const records: any[] = [];
  const promises = [];
  for (const file of files) {
    promises.push(queryFile(dataDir + "/" + file, params));
  }

  await Promise.all(promises).then((results) => {
    for (const result of results) {
      if (result?.length > 0) {
        records.push(...result);
      }
    }
    console.log(`Total: ${records.length}`);
  });

  return records;
};

(async () => {
  console.log("Alright, let's do this ...");

  const start = Date.now();
  const params = new QueryFactory({
    limit: 100,
    offset: 0,
    filters: [],
  });
  params.addFilter({ key: "mag", opt: FilterOperator.More, value: 1 });
  params.addFilter({ key: "mag", opt: FilterOperator.Less, value: 2 });
  await search(dataPath, params);
  const end = Date.now();

  console.log(`Done in ${(end - start) / 1000} seconds.`);
})();
