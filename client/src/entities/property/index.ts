export {
  BUILDING_PRESENCE_OPTIONS,
  PROPERTY_TYPE_OPTIONS,
  UNIT_STATUS_OPTIONS
} from './constants/propertyOptions';
export {
  getFloorLabel,
  getUnitLabel
} from './lib/unitLabel';
export {
  getUnitSignupLabel
} from './lib/unitSignupLabel';
export {
  getManagedPropertiesQueryKey
} from './model/managementQueryKeys';
export {
  getManagementDashboardPath,
  isPropertyId
} from './model/propertyRoutes';
export {
  getBuildingNameError,
  getUnitFormErrors,
  normalizeBuildingName,
  normalizeUnitForm
} from './model/unitForm';
export type {
  BuildingDraft,
  UnitDraft,
  UnitForm,
  UnitFormErrors,
  UnitStatus
} from './model/unitFormTypes';
export type {
  UnitResidentSummary
} from './model/unitResidentsTypes';
export {
  getSortedBuildings,
  getSortedUnits
} from './model/unitSorting';
export {
  BuildingUnitFormModal,
  type BuildingUnitFormTarget
} from './ui/building-unit-form-modal/buildingUnitFormModal';

export {
  EMPTY_AUTOMATIC_UNIT_RULE,
  createAutomaticUnits,
  getAutomaticUnitPreview
} from './model/automaticUnits';
export type {
  AutomaticUnitRule
} from './model/automaticUnitsTypes';
export {
  AutomaticUnitEditor
} from './ui/automatic-unit-editor/automaticUnitEditor';
export {
  BuildingManager
} from './ui/building-manager/buildingManager';
export {
  UnitDeleteConfirmation
} from './ui/unit-delete-confirmation/unitDeleteConfirmation';

export {
  UnitDetail
} from './ui/unit-detail/unitDetail';

export {
  capturePropertyQueryScope,
  endPropertyQueryScope,
  setPropertyQueryData
} from './model/propertyQueryScope';
