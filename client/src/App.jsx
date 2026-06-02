import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import AppLayout from "@/components/layout/AppLayout";
import Login       from "@/pages/Login";
import Overview    from "@/pages/Overview";
import Leads       from "@/pages/Leads";
import Properties  from "@/pages/Properties";
import Conversations from "@/pages/Conversations";
import Viewings    from "@/pages/Viewings";
import Broadcasts  from "@/pages/Broadcasts";
import Settings    from "@/pages/Settings";

function PrivateRoute({ children }) {
  return localStorage.getItem("dt_token") ? children : <Navigate to="/app/login" replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/app/login" element={<Login />} />
        <Route
          path="/app/*"
          element={
            <PrivateRoute>
              <AppLayout />
            </PrivateRoute>
          }
        >
          <Route index         element={<Navigate to="/app/overview" replace />} />
          <Route path="overview"      element={<Overview />} />
          <Route path="leads"         element={<Leads />} />
          <Route path="properties"    element={<Properties />} />
          <Route path="conversations" element={<Conversations />} />
          <Route path="viewings"      element={<Viewings />} />
          <Route path="broadcasts"    element={<Broadcasts />} />
          <Route path="settings"      element={<Settings />} />
        </Route>
        <Route path="*" element={<Navigate to="/app/overview" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
