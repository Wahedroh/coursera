import { BrowserRouter, Route, Routes } from 'react-router'
import StudentHome from './pages/StudentHome'
import StudentCheckin from './pages/StudentCheckin'
import StudentLogin from './pages/StudentLogin'
import StudentProgress from './pages/StudentProgress'
import StudentSubmit from './pages/StudentSubmit'
import TeacherAssignmentForm from './pages/TeacherAssignmentForm'
import TeacherAttendance from './pages/TeacherAttendance'
import TeacherCheckinScreen from './pages/TeacherCheckinScreen'
import TeacherClass from './pages/TeacherClass'
import TeacherSeating from './pages/TeacherSeating'
import TeacherGrade from './pages/TeacherGrade'
import TeacherGradebook from './pages/TeacherGradebook'
import TeacherHome from './pages/TeacherHome'
import TeacherImport from './pages/TeacherImport'
import TeacherLogin from './pages/TeacherLogin'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<StudentLogin />} />
        <Route path="/me" element={<StudentHome />} />
        <Route path="/me/assignments/:id" element={<StudentSubmit />} />
        <Route path="/me/progress" element={<StudentProgress />} />
        <Route path="/checkin" element={<StudentCheckin />} />
        <Route path="/teacher/login" element={<TeacherLogin />} />
        <Route path="/teacher" element={<TeacherHome />} />
        <Route path="/teacher/import" element={<TeacherImport />} />
        <Route path="/teacher/classes/:id" element={<TeacherClass />} />
        <Route path="/teacher/classes/:id/gradebook" element={<TeacherGradebook />} />
        <Route path="/teacher/classes/:id/attendance" element={<TeacherAttendance />} />
        <Route path="/teacher/classes/:id/seating" element={<TeacherSeating />} />
        <Route path="/teacher/attendance/:dayId/qr" element={<TeacherCheckinScreen />} />
        <Route path="/teacher/assignments/new" element={<TeacherAssignmentForm />} />
        <Route path="/teacher/assignments/:id/edit" element={<TeacherAssignmentForm />} />
        <Route path="/teacher/submissions/:id" element={<TeacherGrade />} />
      </Routes>
    </BrowserRouter>
  )
}
