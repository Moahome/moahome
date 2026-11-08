import {
  expect,
  test
} from '@playwright/test';
import { getImageCrop } from '../src/shared/ui/image-crop-dialog/model/imageCrop';

test('가로·세로 사진은 중앙 정사각 영역에서 시작하고 가장자리 밖의 이동을 제한', () => {
  const wide = getImageCrop({
    width: 400,
    height: 200
  }, 320, 1, {
    x: 0,
    y: 0
  });
  expect(wide.sourceX).toBe(100);
  expect(wide.sourceY).toBe(0);
  expect(wide.sourceSize).toBe(200);
  const edge = getImageCrop({
    width: 400,
    height: 200
  }, 320, 1, {
    x: 999,
    y: -999
  });
  expect(edge.offset).toEqual({
    x: 160,
    y: -0
  });
  expect(edge.sourceX).toBe(0);
  expect(edge.sourceY).toBe(0);
  const tall = getImageCrop({
    width: 200,
    height: 400
  }, 280, 1, {
    x: -999,
    y: -999
  });
  expect(tall.sourceX).toBe(0);
  expect(tall.sourceY).toBe(200);
  expect(tall.sourceSize).toBe(200);
});

test('확대는 원본의 더 작은 정사각 영역을 선택하고 화면 크기와 무관하게 같은 비율을 자른다', () => {
  const desktop = getImageCrop({
    width: 1000,
    height: 800
  }, 320, 2, {
    x: 80,
    y: -40
  });
  const mobile = getImageCrop({
    width: 1000,
    height: 800
  }, 240, 2, {
    x: 60,
    y: -30
  });
  expect(desktop.sourceSize).toBe(400);
  expect(desktop.sourceX).toBe(mobile.sourceX);
  expect(desktop.sourceY).toBe(mobile.sourceY);
  expect(desktop.sourceSize).toBe(mobile.sourceSize);
  for (const zoom of [1, 1.5, 3]) {
    const crop = getImageCrop({
      width: 400,
      height: 200
    }, 280, zoom, {
      x: -9999,
      y: 9999
    });
    expect(crop.sourceX).toBeGreaterThanOrEqual(0);
    expect(crop.sourceY).toBeGreaterThanOrEqual(0);
    expect(crop.sourceX + crop.sourceSize).toBeLessThanOrEqual(400.00001);
    expect(crop.sourceY + crop.sourceSize).toBeLessThanOrEqual(200.00001);
  }
});
