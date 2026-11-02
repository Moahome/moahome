import type { Metadata } from 'next';
import { Geist_Mono } from 'next/font/google';
import localFont from 'next/font/local';
import { ServiceMaintenancePage } from '@/screens/service-maintenance';
import { AppProviders } from './providers/appProviders';
import { SERVICE_SHARE_METADATA } from './metadata/shareMetadata';
import { MobileSplash } from './ui/mobile-splash/mobileSplash';
import { MOBILE_SPLASH_BOOTSTRAP } from './ui/mobile-splash/mobileSplashBootstrap';
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
    '소규모 공동주택 관리비 통합 플랫폼, 모아홈. 관리소장의 세대·주민 관리부터 관리비 부과·수납, 통장 거래와 월별 정산까지 한곳에서 처리하세요.',
  icons: {
    icon: {
      url: '/moahomeIcon.svg',
      type: 'image/svg+xml',
      sizes: 'any',
    },
    apple: {
      url: '/icons/appleTouchIcon.png',
      sizes: '180x180',
      type: 'image/png',
    },
  },
  appleWebApp: {
    capable: true,
    title: '모아홈',
    statusBarStyle: 'default',
  },
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html
      lang={'ko'}
      data-scroll-behavior={'smooth'}
      data-mobile-splash={'idle'}
      suppressHydrationWarning
      className={`${pretendard.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        {/* 처음 그리기 전에 탭의 표시 여부를 결정하며 html의 스플래시 표시 속성만 변경합니다. */}
        {process.env.MOAHOME_MAINTENANCE_MODE !== 'true' && (
          <script
            id={'mobile-splash-bootstrap'}
            dangerouslySetInnerHTML={{
              __html: MOBILE_SPLASH_BOOTSTRAP
            }}
          />
        )}
      </head>
      <body
        className={'min-h-full flex flex-col'}
      >
        {/* 일반 장애와 구분해 운영자가 빌드·실행 환경에서 점검을 명시한 경우만 전환합니다. */}
        {process.env.MOAHOME_MAINTENANCE_MODE === 'true' ? (
          <ServiceMaintenancePage />
        ) : (
          <MobileSplash>
            <AppProviders>
              {children}
            </AppProviders>
          </MobileSplash>
        )}
      </body>
    </html>
  );
}
