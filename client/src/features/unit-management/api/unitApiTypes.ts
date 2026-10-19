import type {
  BuildingDraft,
  UnitDraft,
  UnitResidentSummary
} from '@/entities/property';

export interface UnitResponse {
  id: string;
  buildingId: string | null;
  unitNumber: string;
  displayName: string | null;
  floor: number | null;
  status: UnitDraft['status'];
}

export interface UnitList {
  hasBuildings: boolean;
  buildings: BuildingDraft[];
  units: UnitDraft[];
  residentSummaries: Record<string, UnitResidentSummary> | null;
}

export interface UnitListResponse {
  propertyId: string;
  hasBuildings: boolean;
  buildings: {
    id: string;
    name: string;
  }[];
  units: UnitResponse[];
  residentSummaries: unknown;
}

export interface BuildingResponse {
  id: string;
  name: string;
}
