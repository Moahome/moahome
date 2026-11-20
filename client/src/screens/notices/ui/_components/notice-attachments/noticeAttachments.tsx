'use client';

import { useCallback } from 'react';
import { NoticeAttachments as SharedNoticeAttachments } from '@/entities/notice';
import {
  readNoticeAsset,
  uploadNoticeAsset
} from '../../../api/noticeApi';

/** 관리자 파일 API를 주입하고 문서·첨부 표현은 주민 화면과 공유합니다. */
export function NoticeAttachments({ propertyId, ...props }: { propertyId: string; content: string; onChange?: (content: string) => void; onBusyChange?: (busy: boolean) => void; disabled?: boolean; }) {
  const uploadAsset = useCallback((file: File, image: boolean) => uploadNoticeAsset(propertyId, file, image), [propertyId]);
  return (
    <SharedNoticeAttachments
      {...props}
      readAsset={readNoticeAsset}
      uploadAsset={uploadAsset}
    />
  );
}
