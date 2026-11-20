'use client';

import { useCallback } from 'react';
import { NoticeEditor as SharedNoticeEditor } from '@/entities/notice';
import {
  readNoticeAsset,
  uploadNoticeAsset
} from '../../../api/noticeApi';

/** 관리자 파일 API를 주입하고 문서·첨부 표현은 주민 화면과 공유합니다. */
export function NoticeEditor({ propertyId, ...props }: { propertyId: string; initialContent?: string; onChange?: (content: string) => void; onBusyChange?: (busy: boolean) => void; disabled?: boolean; readOnly?: boolean; }) {
  const uploadAsset = useCallback((file: File, image: boolean) => uploadNoticeAsset(propertyId, file, image), [propertyId]);
  return (
    <SharedNoticeEditor
      {...props}
      readAsset={readNoticeAsset}
      uploadAsset={uploadAsset}
    />
  );
}
