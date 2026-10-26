/** กฎ EXP (ค่าคงที่ — ยังไม่มีหน้าแก้) */
export const EXP_RULES = { attendance: 2, assignmentOnTime: 10, assignmentLate: 5 } as const
export const EXP_PER_LEVEL = 100
export const levelOf = (exp: number) => Math.max(0, Math.floor(exp / EXP_PER_LEVEL))
