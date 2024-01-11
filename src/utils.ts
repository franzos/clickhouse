import { readdir } from "fs/promises";
import { FilterOperator, QueryFactory } from "./types";

export const listFiles = async (dir: string) => {
  const files = await readdir(dir);
  return files.filter((file) => file.endsWith(".csv"));
};

export const filterOperatorToSQL = (opt: FilterOperator): string => {
  switch (opt) {
    case FilterOperator.Equal:
      return "=";
    case FilterOperator.NotEqual:
      return "!=";
    case FilterOperator.Less:
      return "<";
    case FilterOperator.More:
      return ">";
    default:
      throw new Error("Unknown operator");
  }
};

export const queryToSQL = (tablename: string, query: QueryFactory): string => {
  let sql = `SELECT * FROM ${tablename}`;
  if (query.filters.length > 0) {
    const where = query.filters
      .map(
        (filter) =>
          `${filter.key} ${filterOperatorToSQL(filter.opt)} '${filter.value}'`,
      )
      .join(" AND ");
    sql = `${sql} WHERE ${where}`;
  }
  return sql + ` LIMIT ${query.limit} OFFSET ${query.offset}`;
};

export const countSQL = (tablename: string, query: QueryFactory): string => {
  let sql = `SELECT COUNT() FROM ${tablename}`;
  if (query.filters.length > 0) {
    const where = query.filters
      .map(
        (filter) =>
          `${filter.key} ${filterOperatorToSQL(filter.opt)} '${filter.value}'`,
      )
      .join(" AND ");
    sql = `${sql} WHERE ${where}`;
  }
  return sql;
};

export const defaultZero = (value: number | undefined): string => {
  return value === undefined || (value as any) == "" ? "0" : `${value}`;
};
