export interface EarthquakeRecord {
  FF: string;
  latitude: number;
  longitude: number;
  depth: number;
  mag: number;
  magType: string;
  nst: number;
  gap: number;
  dmin: number;
  rms: number;
  net: string;
  id: string;
  updated: string;
  place: string;
  type: string;
  horizontalError: number;
  depthError: number;
  magError: number;
  magNst: number;
  status: string;
  locationSource: string;
  magSource: string;
}

export enum FilterOperator {
  Equal,
  NotEqual,
  Less,
  More,
}

export interface Filter {
  key: string;
  opt: FilterOperator;
  value: string | number;
}

export interface QueryParams {
  limit?: number;
  offset?: number;
  filters?: Filter[];
}

export class QueryFactory {
  limit: number;
  offset: number;
  filters: Filter[];

  constructor(params?: QueryParams) {
    this.limit = params?.limit || 10;
    this.offset = params?.offset || 0;
    this.filters = params?.filters || [];
  }

  addFilter(filter: Filter) {
    this.filters.push(filter);
  }
}
