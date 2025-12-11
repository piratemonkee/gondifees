import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'GONDI Protocol Fees Dashboard',
  description: 'Track daily, weekly, and monthly fees collected by the GONDI protocol',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}

