import type { Metadata } from 'next';
import './globals.css';
import { ActionableErrorBanner } from '@/components/ActionableErrorBanner';

export const metadata: Metadata = {
  title: 'Reflo',
  description: 'Self-hostable partner attribution and settlement platform.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ActionableErrorBanner />
        {children}
      </body>
    </html>
  );
}
