import type { Metadata } from 'next';
import { ReportDownloadPage } from '@/screens/report-download';

export const metadata: Metadata = {
  title: '계정별 원장 다운로드',
  robots: {
    index: false,
    follow: false
  }
};

export default function Page() {
  return <ReportDownloadPage />;
}
