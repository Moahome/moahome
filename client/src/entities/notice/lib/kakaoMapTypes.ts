export interface KakaoMapPoint {
  getLat(): number;
  getLng(): number;
}

export interface KakaoMapInstance {
  relayout(): void;
  getCenter(): KakaoMapPoint;
  setCenter(position: KakaoMapPoint): void;
  addControl(control: object, position: number): void;
}

export interface KakaoAddressResult {
  address_name: string;
  x: string;
  y: string;
  road_address?: { address_name: string;
building_name: string } | null;
}

export interface KakaoMaps {
  load(callback: () => void): void;
  LatLng: new (latitude: number, longitude: number) => KakaoMapPoint;
  Map: new (container: HTMLElement, options: {
    center: KakaoMapPoint;
    level: number;
    draggable: boolean;
    scrollwheel: boolean;
    disableDoubleClickZoom: boolean;
    keyboardShortcuts: boolean;
  }) => KakaoMapInstance;
  ZoomControl: new () => object;
  ControlPosition: { RIGHT: number };
  Marker: new (options: { map: KakaoMapInstance;
position: KakaoMapPoint }) => { setMap(map: KakaoMapInstance | null): void };
  services: {
    Status: { OK: string;
ZERO_RESULT: string };
    Geocoder: new () => {
      addressSearch(address: string, callback: (results: KakaoAddressResult[], status: string) => void, options: { size: number }): void;
    };
  };
}
