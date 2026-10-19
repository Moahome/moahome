export interface AutomaticUnitRule {
  startFloor: string;
  endFloor: string;
  unitsPerFloor: string;
}

export type AutomaticUnitErrors = Partial<Record<keyof AutomaticUnitRule | 'buildingClientId', string>>;
