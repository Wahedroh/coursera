import { z } from 'zod'

export const teacherLoginSchema = z.object({ password: z.string().min(1).max(200) })
