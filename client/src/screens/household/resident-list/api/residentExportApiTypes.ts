export interface ResidentExportRow {
  name: string;
  phone: string | null;
  unitLabel: string;
}

export interface ResidentExportResponse {
  residents: ResidentExportRow[];
}
