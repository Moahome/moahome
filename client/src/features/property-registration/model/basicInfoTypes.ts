export interface BasicInfoDraft {
  name: string;
  address: string;
  addressDetail: string;
  propertyType: string;
  hasBuildings: boolean | null;
}

export interface BasicInfo extends Omit<BasicInfoDraft, 'addressDetail' | 'propertyType' | 'hasBuildings'> {
  addressDetail: string | null;
  propertyType: string | null;
  hasBuildings: boolean;
}

export type BasicInfoErrors = Partial<Record<keyof BasicInfoDraft, string>>;
