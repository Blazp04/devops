import { createElement, lazy, Suspense, type ComponentType } from 'react'
import { Link, useParams } from 'react-router'

/** Design-direction prototypes: src/design-lab/<key>/index.tsx, served at /dizajn/<key> (outside the site shell). */
const modules = import.meta.glob<{ default: ComponentType }>('./*/index.tsx')
const pages: Record<string, ComponentType> = Object.fromEntries(
  Object.entries(modules).map(([path, loader]) => [path.split('/').at(-2) ?? '', lazy(loader)]),
)

export function DesignLabIndex() {
  return (
    <div style={{ padding: 40, fontFamily: 'system-ui', background: '#fff', color: '#111', minHeight: '100vh' }}>
      <h1>Dizajnerski smjerovi</h1>
      <ul>
        {Object.keys(pages).map((k) => (
          <li key={k}>
            <Link to={`/dizajn/${k}`}>{k}</Link>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function DesignLabPage() {
  const { key = '' } = useParams()
  const page = pages[key]
  if (!page) return <DesignLabIndex />
  return <Suspense fallback={null}>{createElement(page)}</Suspense>
}
