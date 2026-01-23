import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Ankify - Curriculum Alignment for Medical Students',
  description: 'Map your lecture slides to AnKing Anki cards for efficient studying',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-neo-bg antialiased">
        {children}
      </body>
    </html>
  );
}
