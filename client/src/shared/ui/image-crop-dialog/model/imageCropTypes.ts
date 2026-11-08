export interface CropImageSize {
  width: number;
  height: number;
}

export interface CropOffset {
  x: number;
  y: number;
}

export interface ImageCrop {
  width: number;
  height: number;
  offset: CropOffset;
  sourceX: number;
  sourceY: number;
  sourceSize: number;
}
