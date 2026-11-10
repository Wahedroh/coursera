import { z } from 'zod'

export const pushSubscribeSchema = z.object({ endpoint: z.string().url().max(1000) })
export type StudentNotification = { id: string; title: string; body: string; url: string; createdAt: number; read?: boolean }
export type NotificationInbox = { unread: number; items: StudentNotification[] }
