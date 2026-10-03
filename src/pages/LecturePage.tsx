import { Suspense } from 'react'
import { useParams } from 'react-router'
import { getLecture, renderLecture } from '../curriculum/registry'
import { LectureProvider } from '../kit/lecture-context'
import { NotFoundPage } from './NotFoundPage'
import { usePageTitle } from '../shell/usePageTitle'
import { LectureNav, PencilProgress } from './lecture/LectureNav'
import { ComingSoon, LectureFooter, LectureHeader, LectureSkeleton } from './lecture/LectureParts'

/**
 * One lecture = one spread of the notebook: the lesson header, the lecture body (sections registered in the
 * kazalo), the "završeno" stamp and page-turn cards. `data-module` colours the module tab and --module-accent.
 */
export function LecturePage() {
  const { slug = '' } = useParams()
  const meta = getLecture(slug)
  usePageTitle(meta ? `${meta.id} · ${meta.title}` : 'Stranica ne postoji')
  if (!meta) return <NotFoundPage />

  return (
    <LectureProvider key={slug} slug={slug}>
      <article className="nb-lecture" data-module={meta.module}>
        <PencilProgress />
        <LectureHeader meta={meta} />
        <LectureNav />
        <div className="nb-lecture__body">
          <Suspense fallback={<LectureSkeleton />}>{renderLecture(slug, <ComingSoon meta={meta} />)}</Suspense>
        </div>
        <LectureFooter meta={meta} />
      </article>
    </LectureProvider>
  )
}
