import { BrowserRouter, Route, Routes } from 'react-router'
import StudentHome from './pages/StudentHome'
import StudentCheckin from './pages/StudentCheckin'
import StudentLogin from './pages/StudentLogin'
import StudentProgress from './pages/StudentProgress'
import StudentScores from './pages/StudentScores'
import StudentVideos from './pages/StudentVideos'
import StudentMaterials from './pages/StudentMaterials'
import StudentVideo from './pages/StudentVideo'
import StudentFees from './pages/StudentFees'
import StudentAvatar from './pages/StudentAvatar'
import TeacherVideos from './pages/TeacherVideos'
import TeacherMaterials from './pages/TeacherMaterials'
import TeacherAnnouncements from './pages/TeacherAnnouncements'
import TeacherFees from './pages/TeacherFees'
import TeacherFeeItem from './pages/TeacherFeeItem'
import StudentSubmit from './pages/StudentSubmit'
import TeacherAssignmentForm from './pages/TeacherAssignmentForm'
import TeacherAttendance from './pages/TeacherAttendance'
import TeacherCheckinScreen from './pages/TeacherCheckinScreen'
import TeacherClass from './pages/TeacherClass'
import TeacherSeating from './pages/TeacherSeating'
import TeacherScoreEntry from './pages/TeacherScoreEntry'
import TeacherScores from './pages/TeacherScores'
import TeacherGrade from './pages/TeacherGrade'
import TeacherGradebook from './pages/TeacherGradebook'
import TeacherHome from './pages/TeacherHome'
import TeacherImport from './pages/TeacherImport'
import TeacherStorage from './pages/TeacherStorage'
import TeacherGrades from './pages/TeacherGrades'
import TeacherLogin from './pages/TeacherLogin'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<StudentLogin />} />
        <Route path="/me" element={<StudentHome />} />
        <Route path="/me/assignments/:id" element={<StudentSubmit />} />
        <Route path="/me/progress" element={<StudentProgress />} />
        <Route path="/me/scores" element={<StudentScores />} />
        <Route path="/me/videos" element={<StudentVideos />} />
        <Route path="/me/materials" element={<StudentMaterials />} />
        <Route path="/me/videos/:id" element={<StudentVideo />} />
        <Route path="/me/fees" element={<StudentFees />} />
        <Route path="/me/avatar" element={<StudentAvatar />} />
        <Route path="/checkin" element={<StudentCheckin />} />
        <Route path="/teacher/login" element={<TeacherLogin />} />
        <Route path="/teacher" element={<TeacherHome />} />
        <Route path="/teacher/import" element={<TeacherImport />} />
        <Route path="/teacher/classes/:id" element={<TeacherClass />} />
        <Route path="/teacher/classes/:id/gradebook" element={<TeacherGradebook />} />
        <Route path="/teacher/classes/:id/attendance" element={<TeacherAttendance />} />
        <Route path="/teacher/classes/:id/seating" element={<TeacherSeating />} />
        <Route path="/teacher/classes/:id/scores" element={<TeacherScores />} />
        <Route path="/teacher/score-items/:id" element={<TeacherScoreEntry />} />
        <Route path="/teacher/classes/:id/videos" element={<TeacherVideos />} />
        <Route path="/teacher/classes/:id/materials" element={<TeacherMaterials />} />
        <Route path="/teacher/classes/:id/announcements" element={<TeacherAnnouncements />} />
        <Route path="/teacher/classes/:id/fees" element={<TeacherFees />} />
        <Route path="/teacher/fee-items/:id" element={<TeacherFeeItem />} />
        <Route path="/teacher/storage" element={<TeacherStorage />} />
        <Route path="/teacher/classes/:id/grades" element={<TeacherGrades />} />
        <Route path="/teacher/attendance/:dayId/qr" element={<TeacherCheckinScreen />} />
        <Route path="/teacher/assignments/new" element={<TeacherAssignmentForm />} />
        <Route path="/teacher/assignments/:id/edit" element={<TeacherAssignmentForm />} />
        <Route path="/teacher/submissions/:id" element={<TeacherGrade />} />
      </Routes>
    </BrowserRouter>
  )
}
