import type {Metadata} from 'next';
import './globals.css'; // Global styles

export const metadata: Metadata = {
  title: 'Engenho da Bola - Gestão de Quadras, Bar e Cozinha',
  description: 'Sistema de gestão integrado para o complexo esportivo, bar e cozinha Engenho da Bola.',
  openGraph: {
    title: 'Engenho da Bola - Gestão Integrada',
    description: 'Sistema operacional para quadras de areia, campo society, bar e comandas.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Engenho da Bola - Gestão Integrada',
    description: 'Sistema operacional para quadras de areia, campo society, bar e comandas.',
  },
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="en">
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
