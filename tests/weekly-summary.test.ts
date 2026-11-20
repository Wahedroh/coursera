import { describe, expect, it } from 'vitest'
import { summaryWeek, weekOf, weeklySummaryText, type DayPlan, type Stop } from '../src/shared/workload'

const stop = (name: string, periods: number, o: Partial<Stop> = {}): Stop => ({
  kind: 'school', key: name, name, start: '08:00', end: '09:00', periods, classes: [], closed: null, lat: null, lng: null, nav: '', countPeriods: true, countTrips: true, ...o,
})
const day = (date: string, stops: Stop[]): DayPlan => ({ date, weekday: 1, stops, periods: 0, closedPeriods: 0, trips: 0 })
const online = (name: string, periods: number) => stop(name, periods, { kind: 'makeup', key: `online:${name}`, countTrips: false, makeup: { id: 'm', mode: 'online', meetUrl: null, forDate: null, reason: null, note: '' } })

describe('สรุปรายสัปดาห์', () => {
  it('สัปดาห์ = เสาร์–ศุกร์ · เสาร์/อาทิตย์สรุปสัปดาห์ที่เพิ่งจบ', () => {
    expect(weekOf('2026-11-12')).toEqual({ from: '2026-11-07', to: '2026-11-13' }) // พฤ.
    expect(weekOf('2026-11-07')).toEqual({ from: '2026-11-07', to: '2026-11-13' }) // ส.
    expect(weekOf('2026-11-13')).toEqual({ from: '2026-11-07', to: '2026-11-13' }) // ศ.
    expect(summaryWeek('2026-11-14')).toEqual({ from: '2026-11-07', to: '2026-11-13' }) // ส. ถัดไป
    expect(summaryWeek('2026-11-15')).toEqual({ from: '2026-11-07', to: '2026-11-13' }) // อา.
    expect(summaryWeek('2026-11-16')).toEqual({ from: '2026-11-14', to: '2026-11-20' }) // จ.
  })

  it('ตรงกับรูปแบบที่ครูส่ง: คาบต่อวันแยกโรงเรียน · ชดออนไลน์ไม่นับเดินทาง · ปิดไม่นับ', () => {
    const days = [
      day('2026-11-09', [stop('ดรุณ', 4), stop('บำรุง', 3), stop('ประสาน', 2)]),
      day('2026-11-10', [stop('ประสาน', 4), stop('บาเจาะ', 4)]),
      day('2026-11-11', [stop('บาเจาะ', 4), stop('ดรุณ', 2, { closed: { reason: 'holiday', note: '', closureId: 'c', allSchools: false, makeupNeeded: false } })]),
      day('2026-11-12', [stop('ดรุณ', 4), stop('ดฟก', 4), online('ประสาน', 2)]),
    ]
    expect(weeklySummaryText(days, 'อับดุลวาเหตุ')).toBe(
      [
        'อับดุลวาเหตุ',
        'ดรุณ\n9/11 จำนวน 4 คาบ\n12/11 จำนวน 4 คาบ',
        'บำรุง\n9/11 จำนวน 3 คาบ',
        'ประสาน\n9/11 จำนวน 2 คาบ\n10/11 จำนวน 4 คาบ\n12/11 จำนวน 2 คาบ(ชดออนไลน์)',
        'บาเจาะ\n10/11 จำนวน 4 คาบ\n11/11 จำนวน 4 คาบ',
        'ดฟก\n12/11 จำนวน 4 คาบ',
        'เดินทาง ดรุณ2 บำรุง1 ประสาน2 บาเจาะ2 ดฟก1',
      ].join('\n\n'),
    )
  })

  it('โรงเรียนที่ไม่นับคาบ = มีแค่ในบรรทัดเดินทาง · ไม่นับเดินทาง = ไม่อยู่ในบรรทัดเดินทาง · ชดเชยที่โรงเรียนแยกบรรทัด', () => {
    const days = [day('2026-11-09', [stop('ประทีป', 3, { countPeriods: false }), stop('ดรุณ', 2, { countTrips: false }), stop('ดรุณ', 1, { kind: 'makeup', key: 'ดรุณ2' })])]
    expect(weeklySummaryText(days, '')).toBe('ดรุณ\n9/11 จำนวน 2 คาบ\n9/11 จำนวน 1 คาบ(ชดเชย)\n\nเดินทาง ประทีป1 ดรุณ1')
    expect(weeklySummaryText([], 'ครู')).toBe('ครู')
  })
})
