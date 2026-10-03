import { useEffect } from 'react'
import { COURSE } from '../curriculum/data'

/** Sets the browser tab title for a page: "<page> · Kubernetes od nule" (the course title alone when `page` is empty). */
export function usePageTitle(page?: string) {
  useEffect(() => {
    document.title = page ? `${page} · ${COURSE.title}` : `${COURSE.title} · bilježnica iz raspodijeljenih sustava`
  }, [page])
}
