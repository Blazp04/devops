import { lazy, Suspense } from 'react'
import { createBrowserRouter, RouterProvider } from 'react-router'
import { AppShell } from './shell/AppShell'
import { ThemeProvider } from './shell/theme'
import { HomePage } from './pages/HomePage'
import { LecturePage } from './pages/LecturePage'
import { GlossaryPage } from './pages/GlossaryPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { DesignLabIndex, DesignLabPage } from './design-lab/DesignLab'

const KitPage = lazy(() => import('./pages/KitPage'))
const DoodlesPage = lazy(() => import('./pages/DoodlesPage'))

const router = createBrowserRouter(
  [
    { path: '/dizajn', element: <DesignLabIndex /> },
    { path: '/dizajn/:key', element: <DesignLabPage /> },
    {
      element: <AppShell />,
      children: [
        { path: '/', element: <HomePage /> },
        { path: '/predavanje/:slug', element: <LecturePage /> },
        { path: '/pojmovnik', element: <GlossaryPage /> },
        {
          path: '/kit',
          element: (
            <Suspense fallback={null}>
              <KitPage />
            </Suspense>
          ),
        },
        {
          path: '/kit/crtezi',
          element: (
            <Suspense fallback={null}>
              <DoodlesPage />
            </Suspense>
          ),
        },
        { path: '*', element: <NotFoundPage /> },
      ],
    },
  ],
  { basename: import.meta.env.BASE_URL.replace(/\/$/, '') || '/' },
)

export default function App() {
  return (
    <ThemeProvider>
      <RouterProvider router={router} />
    </ThemeProvider>
  )
}
