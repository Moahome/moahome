import {
  expect,
  test
} from '@playwright/test';
import { getNoticeDraftSignature } from '../src/screens/notices/model/noticeDraft';

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
