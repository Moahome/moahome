import type { Metadata } from 'next';
import { Geist_Mono } from 'next/font/google';
import localFont from 'next/font/local';
import { ServiceMaintenancePage } from '@/screens/service-maintenance';
import { AppProviders } from './providers/appProviders';
import { SERVICE_SHARE_METADATA } from './metadata/shareMetadata';
import './globals.css';

const pretendard = localFont({
  src: '../../public/fonts/pretendard/pretendardVariable.woff2',
  variable: '--font-pretendard',
  weight: '100 900',
  display: 'swap',
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  ...SERVICE_SHARE_METADATA,
  metadataBase: new URL(process.env.NEXT_PUBLIC_HOST || 'http://localhost:3000'),
  title: {
    default: '모아홈 | 함께 만드는 더 좋은 우리 집',
    template: '%s | 모아홈',
  },
  description:
    '소규모 공동주택을 위한 관리비 통합 플랫폼, 모아홈. 주민의 관리비 조회부터 관리자의 부과·수납, 회계까지 하나로 연결합니다.',
  icons: {
    icon: {
      url: '/moahomeIcon.svg',
      type: 'image/svg+xml',
      sizes: 'any',
    },
  },
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html
      lang={'ko'}
      data-scroll-behavior={'smooth'}
      className={`${pretendard.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body
        className={'min-h-full flex flex-col'}
      >
        {/* 일반 장애와 구분해 운영자가 빌드·실행 환경에서 점검을 명시한 경우만 전환합니다. */}
        {process.env.MOAHOME_MAINTENANCE_MODE === 'true' ? (
          <ServiceMaintenancePage />
        ) : (
          <AppProviders>
            {children}
          </AppProviders>
        )}
      </body>
    </html>
  );
}
