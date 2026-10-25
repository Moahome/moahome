import {
  expect,
  test
} from '@playwright/test';

const PROPERTY_ID = '00000000-0000-4000-8000-000000000001';
const RESIDENT_TITLE = '모아홈에서 우리 빌라 소식을 확인하세요';

for (const [path, imageName, title] of [
  ['/', 'managementPreview', '모아홈 · 소규모 공동주택 관리 플랫폼'],
  ['/invitations', 'managementPreview', '모아홈 관리 업무에 초대받았어요'],
  ['/invitations?type=resident', 'residentPreview', RESIDENT_TITLE],
  ['/invitations?type=unknown', 'managementPreview', '모아홈 관리 업무에 초대받았어요'],
  ['/join', 'residentPreview', RESIDENT_TITLE],
  [`/join/${PROPERTY_ID}`, 'residentPreview', RESIDENT_TITLE],
  ['/resident', 'residentPreview', RESIDENT_TITLE],
]) {
  test(`비로그인 공유 수집기는 ${path}의 최초 HTML에서 맞는 이미지와 문구를 읽는다`, async ({ request }) => {
    const response = await request.get(path, {
      headers: {
        'User-Agent': 'kakaotalk-scrap/1.0',
      },
    });
    expect(response.status()).toBe(200);
    const html = await response.text();
    const head = html.slice(0, html.indexOf('</head>'));
    const imageUrl = `http://localhost:3100/images/share/${imageName}.png`;

    expect(head).toContain(`<meta property="og:title" content="${title}"`);
    expect(head).toContain(`<meta property="og:image" content="${imageUrl}"`);
    expect(head).toContain('<meta property="og:image:width" content="1731"');
    expect(head).toContain('<meta property="og:image:height" content="909"');
    expect(head).toContain('<meta property="og:site_name" content="모아홈"');
    expect(head).toContain('<meta name="twitter:card" content="summary_large_image"');
    expect(head).toContain(`<meta name="twitter:image" content="${imageUrl}"`);
    expect(head).not.toContain(PROPERTY_ID);
  });
}

test('공유 이미지는 인증 없이 PNG 원본으로 제공한다', async ({ request }) => {
  for (const imageName of ['managementPreview', 'residentPreview']) {
    const response = await request.get(`/images/share/${imageName}.png`);
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('image/png');
    const image = await response.body();
    expect(image.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    expect(image.readUInt32BE(16)).toBe(1731);
    expect(image.readUInt32BE(20)).toBe(909);
  }
});
