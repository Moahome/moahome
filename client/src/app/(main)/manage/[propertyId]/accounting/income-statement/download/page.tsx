import type { Metadata } from 'next';
import { ReportDownloadPage } from '@/screens/report-download';

export const metadata: Metadata = {
  title: '손익계산서 다운로드',
  robots: {
    index: false,
    follow: false
  }
};

export default function Page() {
  return <ReportDownloadPage />;
}
