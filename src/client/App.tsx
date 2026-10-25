import { BrowserRouter, Route, Routes } from 'react-router'
import StudentHome from './pages/StudentHome'
import StudentLogin from './pages/StudentLogin'
import TeacherClass from './pages/TeacherClass'
import TeacherHome from './pages/TeacherHome'
import TeacherImport from './pages/TeacherImport'
import TeacherLogin from './pages/TeacherLogin'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<StudentLogin />} />
        <Route path="/me" element={<StudentHome />} />
        <Route path="/teacher/login" element={<TeacherLogin />} />
        <Route path="/teacher" element={<TeacherHome />} />
        <Route path="/teacher/import" element={<TeacherImport />} />
        <Route path="/teacher/classes/:id" element={<TeacherClass />} />
      </Routes>
    </BrowserRouter>
  )
}
