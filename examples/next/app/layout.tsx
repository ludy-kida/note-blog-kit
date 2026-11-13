import 'note-blog-kit/styles.css';
import type { ReactNode } from 'react';

export const metadata = { title: 'note-blog-kit の例' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ja">
      <body style={{ maxWidth: 1080, margin: '0 auto', padding: '32px 16px' }}>{children}</body>
    </html>
  );
}
