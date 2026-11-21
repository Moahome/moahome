import {
  expect,
  test
} from '@playwright/test';
import {
  getNoticeDraftSignature,
  hasNoticeDraftContent
} from '../src/screens/notices/model/noticeDraft';

const original = {
  title: '점검 안내',
  important: true,
  content: JSON.stringify({
    type: 'doc',
    content: [{
      type: 'paragraph',
      content: [{
        type: 'text',
        text: '점검합니다.'
      }]
    }]
  })
};

test('편집기의 기본 속성·JSON 키 순서·빈 첨부 배열은 수정으로 판단하지 않는다', () => {
  const equivalent = {
    ...original,
    content: JSON.stringify({
      files: [],
      content: [{
        content: [{
          text: '점검합니다.',
          marks: [{
            type: 'textStyle',
            attrs: {
              fontSize: '16px'
            }
          }],
          type: 'text'
        }],
        attrs: {
          textAlign: 'left'
        },
        type: 'paragraph'
      }],
      type: 'doc'
    })
  };
  expect(getNoticeDraftSignature(equivalent)).toBe(getNoticeDraftSignature(original));
});

test('실제 제목·본문·고정 설정·서식·파일 변화는 수정으로 판단한다', () => {
  const before = getNoticeDraftSignature(original);
  for (const changed of [
    {
      ...original,
      title: '변경 제목'
    },
    {
      ...original,
      important: false
    },
    {
      ...original,
      content: original.content.replace('점검합니다.', '내일 점검합니다.')
    },
    {
      ...original,
      content: original.content.replace('"type":"paragraph"', '"type":"paragraph","attrs":{"textAlign":"center"}')
    },
    {
      ...original,
      content: JSON.stringify({
        ...JSON.parse(original.content),
        files: [{
          id: 'file-id',
          name: '안내.pdf',
          data: '/api/asset'
        }]
      })
    }
  ]) expect(getNoticeDraftSignature(changed)).not.toBe(before);
});

test('장소만 선택한 초안도 복구 대상으로 보관하고 장소 수정·삭제를 변경으로 판단한다', () => {
  const document = {
    type: 'doc',
    content: [{
      type: 'paragraph'
    }],
    location: {
      name: '모임 장소',
      address: '서울특별시 중구 세종대로 110',
      latitude: 37.5663,
      longitude: 126.9779
    }
  };
  const draft = {
    title: '',
    important: false,
    content: JSON.stringify(document)
  };
  expect(hasNoticeDraftContent(draft)).toBe(true);
  const before = getNoticeDraftSignature(draft);
  for (const location of [null, {
    ...document.location,
    name: '변경 장소'
  }, {
    ...document.location,
    latitude: 37.567
  }]) {
    expect(getNoticeDraftSignature({
      ...draft,
      content: JSON.stringify({
        ...document,
        location
      })
    })).not.toBe(before);
  }
});
