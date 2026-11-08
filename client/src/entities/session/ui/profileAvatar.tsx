'use client';

import Image from 'next/image';
import {
  useEffect,
  useRef,
  useState
} from 'react';
import { useQuery } from '@tanstack/react-query';
import { ApiError } from '@/shared/api';
import { ServiceIcon } from '@/shared/ui/service-icon';
import { authenticatedAPI } from '../api/authenticatedApi';

/** 본인 API 사진만 Bearer로 읽어 Blob URL로 표시하며 토큰을 이미지 주소에 넣지 않습니다. */
export function ProfileAvatar({
  imageUrl,
  size = 44,
  alt = '',
}: {
  imageUrl: string | null;
  size?: number;
  alt?: string;
}) {
  const privateImage = Boolean(imageUrl?.startsWith('/api/users/me/profile-image?'));
  const image = useQuery({
    queryKey: ['session', 'profile-image', imageUrl],
    queryFn: async ({ signal }) => {
      const blob = await authenticatedAPI<Blob>({
        url: imageUrl!,
        responseType: 'blob',
        signal
      });
      if (blob.type !== 'image/png' || blob.size > 2 * 1024 * 1024) {
        throw new ApiError(200, 'INVALID_RESPONSE', '사진을 확인할 수 없습니다.');
      }
      return blob;
    },
    enabled: privateImage,
    staleTime: Infinity,
    retry: false,
    refetchOnWindowFocus: false,
    networkMode: 'always',
  });
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const source = imageUrl;

  if (!source || source === failedSource || (privateImage && !image.data)) {
    return (
      <span
        role={alt ? 'img' : undefined}
        aria-label={alt ? '기본 프로필' : undefined}
        aria-hidden={!alt || undefined}
      >
        <ServiceIcon
          name={'person'}
          size={Math.round(size * 0.6)}
        />
      </span>
    );
  }

  if (privateImage) {
    return (
      <PrivateAvatarImage
        blob={image.data!}
        size={size}
        alt={alt}
        onError={() => setFailedSource(source)}
      />
    );
  }

  return (
    <Image
      src={source}
      alt={alt}
      width={size}
      height={size}
      unoptimized
      onError={() => setFailedSource(source)}
    />
  );
}

/** 인증된 바이트만 브라우저 이미지로 연결하고 이미지 교체·언마운트 때 메모리 주소를 해제합니다. */
function PrivateAvatarImage({ blob, size, alt, onError }: {
  blob: Blob;
  size: number;
  alt: string;
  onError: () => void;
}) {
  const image = useRef<HTMLImageElement>(null);
  useEffect(() => {
    const url = URL.createObjectURL(blob);
    if (image.current) image.current.src = url;
    return () => URL.revokeObjectURL(url);
  }, [blob]);

  return (
    // eslint-disable-next-line @next/next/no-img-element -- Bearer로 받은 Blob을 브라우저 메모리에서만 표시합니다.
    <img
      ref={image}
      width={size}
      height={size}
      alt={alt}
      onError={onError}
    />
  );
}
