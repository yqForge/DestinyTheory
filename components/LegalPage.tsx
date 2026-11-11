import type { ReactNode } from 'react';

/** Shared shell for the local project's usage and privacy notes. */
export default function LegalPage({ title, updated, children, other }: {
  title: string; updated: string; children: ReactNode; other: { href: string; label: string };
}) {
  return (
    <>
      <header style={{ position: 'sticky', top: 0, zIndex: 50, background: 'var(--bg-0)', borderBottom: '1px solid var(--bdr)', padding: '14px 24px', display: 'flex', alignItems: 'center', gap: '16px' }}>
        <a href="/" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: 'var(--tx-3)', textDecoration: 'none' }}>
          <span style={{ fontSize: '16px' }}>‹</span>
          <span>返回首页</span>
        </a>
        <div style={{ width: '1px', height: '20px', background: 'var(--bdr-med)' }} />
        <span style={{ fontSize: '12px', color: 'var(--ac)', letterSpacing: '0.2em' }}>DestinyTheory</span>
      </header>
      <main style={{ maxWidth: 800, margin: '0 auto', padding: '60px 24px 80px', color: 'var(--tx-1)', lineHeight: 1.8 }}>
        <h1 style={{ fontSize: 28, fontWeight: 600, marginBottom: 8 }}>{title}</h1>
        <p style={{ fontSize: 12, color: 'var(--tx-3)', marginBottom: 32 }}>最后更新：{updated}</p>
        {children}
        <p style={{ marginTop: 48, fontSize: 12, color: 'var(--tx-3)' }}>
          <a href={other.href} style={{ color: 'var(--ac)' }}>{other.label}</a> · <a href="/" style={{ color: 'var(--ac)' }}>返回首页</a>
        </p>
      </main>
    </>
  );
}

export const H2 = ({ children }: { children: ReactNode }) => <h2 style={{ fontSize: 18, marginTop: 32, marginBottom: 12 }}>{children}</h2>;
export const List = ({ children }: { children: ReactNode }) => <ul style={{ paddingLeft: 24 }}>{children}</ul>;
