/** กฎ EXP — ตั้งให้นักเรียนที่ขยันสะสมตัวละครครบ 16 ตัวได้ใน 1 เทอม (16 เลเวล = 640 EXP)
 *  ประมาณการ 1 เทอม: มาเรียน 36 คาบ × 5 + งาน 10 ชิ้น × 30 + คลิป 10 คลิป × 5 ≈ 530 + แต้มจากครู ~150 */
export const EXP_RULES = { attendance: 5, video: 5 } as const
export const EXP_PER_LEVEL = 40
/** EXP ของงานที่ตั้งให้อัตโนมัติตอนสร้างงาน (ครูแก้ได้) · ส่งสายได้ครึ่งหนึ่ง */
export const DEFAULT_ASSIGNMENT_EXP = 30
export const lateExp = (onTime: number) => Math.round(onTime / 2)
/** ดูคลิปย้อนหลังถึงสัดส่วนนี้ของความยาวคลิป จึงได้ EXP (คลิปละครั้ง) */
export const VIDEO_WATCH_RATIO = 0.7
export const levelOf = (exp: number) => Math.max(0, Math.floor(exp / EXP_PER_LEVEL))
