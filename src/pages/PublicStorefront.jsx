import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowUpRight } from 'lucide-react'
import RevealMark from '../components/RevealMark'
import { api } from '../lib/api'
import { sendStorefrontView } from '../lib/analytics'
import { PRODUCT_TYPE_LABEL } from '../lib/sectionTypes'
import { useDocumentMeta, PRODUCTION_ORIGIN } from '../lib/useDocumentMeta'

export default function PublicStorefront() {
  const { slug } = useParams()
  const [data, setData] = useState(null)
  const [status, setStatus] = useState('loading')

  useEffect(() => {
    setStatus('loading')
    api
      .getPublicStorefront(slug)
      .then((res) => {
        setData(res)
        setStatus('ready')
        sendStorefrontView(slug)
      })
      .catch((err) => setStatus(err.status === 404 ? 'notfound' : 'error'))
  }, [slug])

  const sf = data?.storefront
  useDocumentMeta({
    title: sf ? `${sf.displayName} — Sneaky Peek` : undefined,
    description: sf?.headline || sf?.bio?.slice(0, 160),
    canonicalPath: `/s/${slug}`,
    noindex: status !== 'ready',
  })

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-paper flex items-center justify-center" role="status" aria-label="Loading">
        <RevealMark size={40} animated animationState="thinking" />
      </div>
    )
  }
  if (status !== 'ready') {
    return (
      <div className="min-h-screen bg-paper flex flex-col items-center justify-center gap-4 px-6 text-center">
        <RevealMark size={40} />
        <h1 className="font-serif text-2xl text-ink">{status === 'notfound' ? "This page isn't available" : 'Something went wrong'}</h1>
        <p className="text-muted text-sm max-w-xs">{status === 'notfound' ? 'The link may be incorrect, or the creator has unpublished it.' : 'Please try again in a moment.'}</p>
      </div>
    )
  }

  const accent = /^#[0-9a-f]{6}$/i.test(sf.accentColor || '') ? sf.accentColor : null

  return (
    <div className="min-h-screen bg-paper" style={accent ? { '--sf-accent': accent } : undefined}>
      <header className="max-w-3xl mx-auto px-6 pt-16 pb-12 text-center">
        <h1 className="font-serif text-4xl md:text-5xl text-ink leading-tight mb-3">{sf.displayName}</h1>
        {sf.headline && <p className="text-lg text-muted">{sf.headline}</p>}
        {sf.bio && <p className="mt-6 text-muted leading-relaxed max-w-xl mx-auto whitespace-pre-line">{sf.bio}</p>}
        {sf.links?.length > 0 && (
          <nav aria-label="Creator links" className="mt-6 flex flex-wrap justify-center gap-2">
            {sf.links.map((l) => (
              <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 rounded-pill border border-line px-3.5 py-1.5 text-sm text-ink hover:border-ink">
                {l.label} <ArrowUpRight size={13} aria-hidden="true" />
              </a>
            ))}
          </nav>
        )}
      </header>

      <main className="max-w-3xl mx-auto px-6 pb-24">
        {data.products.length === 0 ? (
          <p className="text-center text-muted py-12">Nothing here yet — check back soon.</p>
        ) : (
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {data.products.map((p) => (
              <li key={p.slug}>
                <Link
                  to={`/p/${p.slug}`}
                  className="group flex h-full flex-col overflow-hidden rounded-2xl border border-line bg-paper transition-colors hover:border-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                >
                  {p.coverUrl ? (
                    <img src={p.coverUrl} alt="" loading="lazy" className="aspect-[4/3] w-full object-cover bg-surface" />
                  ) : (
                    <div className="aspect-[4/3] w-full bg-surface flex items-center justify-center">
                      <span className="font-serif text-2xl text-ink/60 px-6 text-center">{p.title}</span>
                    </div>
                  )}
                  <div className="flex flex-1 flex-col p-5">
                    <p className="text-[11px] uppercase tracking-widest mb-2" style={{ color: accent || undefined }}>
                      <span className={accent ? '' : 'text-accent-dim'}>{PRODUCT_TYPE_LABEL[p.productType] || 'Experience'}</span>
                    </p>
                    <h2 className="font-serif text-xl text-ink leading-snug mb-2">{p.title}</h2>
                    {(p.hook || p.description) && <p className="text-sm text-muted leading-relaxed line-clamp-3">{p.hook || p.description}</p>}
                    <span className="mt-auto pt-4 text-sm text-ink group-hover:underline underline-offset-2">Take a peek →</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>

      <footer className="border-t border-line py-8 text-center text-xs text-muted">
        Made with <a href={PRODUCTION_ORIGIN} className="underline-offset-2 hover:underline">Sneaky Peek</a>
      </footer>
    </div>
  )
}
