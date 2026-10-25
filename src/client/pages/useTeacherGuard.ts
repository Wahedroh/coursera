import { useCallback } from 'react'
import { useNavigate } from 'react-router'
import { ApiClientError } from '../api'

/** คืนฟังก์ชันจัดการ error: 401 → ไปหน้าล็อกอินครู, อื่น ๆ → คืนข้อความ */
export function useTeacherErrorHandler() {
  const navigate = useNavigate()
  return useCallback(
    (e: unknown): string => {
      if (e instanceof ApiClientError && e.status === 401) {
        navigate('/teacher/login', { replace: true })
        return ''
      }
      return e instanceof ApiClientError ? e.message : 'เกิดข้อผิดพลาด กรุณาลองใหม่'
    },
    [navigate],
  )
}
