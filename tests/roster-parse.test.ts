import { describe, expect, it } from 'vitest'
import { parseClassName, parseZipgradeCsv, splitThaiName } from '../src/shared/roster/parse'
import { canonicalZipgradeId } from '../src/shared/zipgrade'
import fixture from './fixtures/roster.sample.csv?raw'

const HEADER = 'ZipGrade ID,External ID,First Name,Last Name,Classes'

describe('splitThaiName', () => {
  it('แยกคำนำหน้าที่ติดกับชื่อ', () => {
    expect(splitThaiName('เด็กหญิงสมใจ', 'ใจดี')).toEqual({ title: 'เด็กหญิง', firstName: 'สมใจ', lastName: 'ใจดี' })
  })
  it('คำนำหน้าอยู่ลำพัง ชื่อจริงอยู่ในช่องนามสกุล', () => {
    expect(splitThaiName('นางสาว', 'ปิติ ยินดี')).toEqual({ title: 'นางสาว', firstName: 'ปิติ', lastName: 'ยินดี' })
    expect(splitThaiName('เด็กชาย', 'สมชาย รักเรียน มากมาย').lastName).toBe('รักเรียน มากมาย')
  })
  it('นางสาวไม่ถูกตัดเป็นนาง', () => {
    expect(splitThaiName('นางสาวปิติ', 'ยินดี').title).toBe('นางสาว')
  })
  it('ไม่มีคำนำหน้า', () => {
    expect(splitThaiName('มานี', 'มีนา')).toEqual({ title: null, firstName: 'มานี', lastName: 'มีนา' })
  })
})

it('แยกโรงเรียนและชั้น', () => {
  expect(parseClassName('โรงเรียนทดสอบ ชั้น 1')).toEqual({ schoolName: 'โรงเรียนทดสอบ', grade: 1 })
  expect(parseClassName('ชมรมดนตรี')).toEqual({ schoolName: 'ชมรมดนตรี', grade: null })
})

it('canonical ID', () => {
  expect(canonicalZipgradeId(' 0124 ')).toBe('124')
  expect(canonicalZipgradeId('0')).toBe('0')
  expect(canonicalZipgradeId('A12')).toBe('A12')
})

it('parse fixture ครบ 7 แถว พร้อม flag', () => {
  const { rows, errors } = parseZipgradeCsv(fixture)
  expect(errors).toEqual([])
  expect(rows).toHaveLength(7)
  const by = (id: string) => rows.find((r) => r.zipgradeId === id)!
  expect(by('3').flags).toContain('no_title')
  expect(by('5').flags).toContain('duplicate_name')
  expect(by('6').flags).toContain('duplicate_name')
  expect(by('31448').flags).toEqual(expect.arrayContaining(['unusual_id', 'no_title']))
  expect(by('1')).toMatchObject({ title: 'เด็กหญิง', firstName: 'สมใจ', lastName: 'ใจดี', className: 'โรงเรียนทดสอบ ชั้น 1', schoolName: 'โรงเรียนทดสอบ', grade: 1, flags: [] })
})

it('รองรับ BOM และ CRLF', () => {
  expect(parseZipgradeCsv('﻿' + fixture.replace(/\r?\n/g, '\r\n'))).toEqual(parseZipgradeCsv(fixture))
})

it('ID ซ้ำในไฟล์และแถวขาดข้อมูลเข้า errors', () => {
  const csv = [HEADER, '7,,เด็กหญิงก,ข,ห้อง ชั้น 1', '7,,เด็กหญิงค,ง,ห้อง ชั้น 1', ',,เด็กชายจ,ฉ,ห้อง ชั้น 1', '8,,,,ห้อง ชั้น 1', '9,,เด็กชายช,ซ,'].join('\n')
  const { rows, errors } = parseZipgradeCsv(csv)
  expect(rows.map((r) => r.zipgradeId)).toEqual(['7'])
  expect(errors).toEqual([
    { line: 3, message: 'แถว 3: ZipGrade ID ซ้ำกับแถว 2' },
    { line: 4, message: 'แถว 4: ไม่มี ZipGrade ID' },
    { line: 5, message: 'แถว 5: ไม่มีชื่อ' },
    { line: 6, message: 'แถว 6: ไม่มีห้อง (Classes)' },
  ])
})

it('หัวคอลัมน์ขาด → error บรรทัด 1', () => {
  const { rows, errors } = parseZipgradeCsv('ID,Name\n1,ก')
  expect(rows).toEqual([])
  expect(errors).toEqual([{ line: 1, message: 'ไฟล์ไม่มีคอลัมน์ที่ต้องการ: ZipGrade ID, First Name, Last Name, Classes' }])
})
