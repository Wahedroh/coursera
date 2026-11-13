/** กฎ EXP — ครบ 16 ตัว (LV 16 = 640 EXP) ≈ ต้องทำได้ราว 85% ของทั้งเทอม (กติกาครู: ครบชุด = เกรด 4)
 *  ประมาณการเทอมละ 16 สัปดาห์ สัปดาห์ละ 1 คาบ ทำครบทุกอย่าง: มาเรียน 80 + สตรีค 13 + งาน 16 × 25 = 400
 *  + คลิป 80 + ภารกิจ 16 × 9 = 144 + วงล้อ ~70 ≈ 790 */
export const EXP_RULES = { attendance: 5, video: 5 } as const
export const EXP_PER_LEVEL = 40
/** EXP ของงานที่ตั้งให้อัตโนมัติตอนสร้างงาน (ครูแก้ได้) · ส่งสายได้ครึ่งหนึ่ง */
export const DEFAULT_ASSIGNMENT_EXP = 25
export const lateExp = (onTime: number) => Math.round(onTime / 2)
/** ดูคลิปย้อนหลังถึงสัดส่วนนี้ของความยาวคลิป จึงได้ EXP (คลิปละครั้ง) */
export const VIDEO_WATCH_RATIO = 0.7
export const levelOf = (exp: number) => Math.max(0, Math.floor(exp / EXP_PER_LEVEL))
