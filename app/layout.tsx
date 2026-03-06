import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Outline Editor Prototype',
  description: 'Church teaching platform — outline editor prototype',
  viewport: {
    width: 'device-width',
    initialScale: 1,
    viewportFit: 'cover',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,600;0,6..72,700;1,6..72,400&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="antialiased bg-slate-50">{children}</body>
    </html>
  )
}
