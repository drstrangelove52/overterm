import { useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import useAuth from "./store/auth";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import HostForm from "./pages/HostForm";
import HostDetail from "./pages/HostDetail";
import Keys from "./pages/Keys";
import Admin from "./pages/Admin";
import AdminActiveSessions from "./pages/AdminActiveSessions";
import Groups from "./pages/Groups";
import Credentials from "./pages/Credentials";
import Import from "./pages/Import";
import Sessions from "./pages/Sessions";
import Profile from "./pages/Profile";
import About from "./pages/About";

function ProtectedRoute({ children, adminOnly = false }) {
  const { token, user } = useAuth();
  if (!token) return <Navigate to="/login" replace />;
  if (adminOnly && user && !user.is_admin) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  const { token, user, refreshUser } = useAuth();
  useEffect(() => {
    if (token && !user) refreshUser();
  }, []);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Dashboard />} />
          <Route path="hosts/new" element={<ProtectedRoute adminOnly><HostForm /></ProtectedRoute>} />
          <Route path="hosts/:id/edit" element={<ProtectedRoute adminOnly><HostForm /></ProtectedRoute>} />
          <Route path="hosts/:id" element={<HostDetail />} />
          <Route path="keys" element={<Keys />} />
          <Route path="admin" element={<ProtectedRoute adminOnly><Admin /></ProtectedRoute>} />
          <Route path="groups" element={<ProtectedRoute adminOnly><Groups /></ProtectedRoute>} />
          <Route path="import" element={<ProtectedRoute><Import /></ProtectedRoute>} />
          <Route path="credentials" element={<Credentials />} />
          <Route path="sessions" element={<ProtectedRoute adminOnly><Sessions /></ProtectedRoute>} />
          <Route path="active-sessions" element={<ProtectedRoute adminOnly><AdminActiveSessions /></ProtectedRoute>} />
          <Route path="profile" element={<Profile />} />
          <Route path="about" element={<About />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
