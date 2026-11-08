import type {
  CropImageSize,
  CropOffset,
  ImageCrop
} from './imageCropTypes';

/** 원형 미리보기의 바깥이 비지 않도록 이동을 제한하고 같은 사각 영역의 원본 좌표를 계산합니다. */
export function getImageCrop(image: CropImageSize, viewport: number, zoom: number, offset: CropOffset): ImageCrop {
  const side = Math.max(1, viewport);
  const scale = Math.max(side / image.width, side / image.height) * Math.max(1, Math.min(3, zoom));
  const width = image.width * scale;
  const height = image.height * scale;
  const limitX = Math.max(0, (width - side) / 2);
  const limitY = Math.max(0, (height - side) / 2);
  const x = Math.max(-limitX, Math.min(limitX, offset.x));
  const y = Math.max(-limitY, Math.min(limitY, offset.y));
  const sourceSize = side / scale;

  return {
    width,
    height,
    offset: {
      x,
      y
    },
    sourceX: Math.max(0, (image.width - sourceSize) / 2 - x / scale),
    sourceY: Math.max(0, (image.height - sourceSize) / 2 - y / scale),
    sourceSize
  };
}
