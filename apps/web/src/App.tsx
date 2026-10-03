import { Route, Routes } from "react-router-dom";
import Landing from "./app/page.tsx";
import Agents from "./app/agents/page.tsx";
import Checkout from "./app/checkout/page.tsx";
import CustomRequest from "./app/custom-request/page.tsx";
import Hire from "./app/hire/[agent]/page.tsx";
import History from "./app/history/page.tsx";
import Report from "./app/report/[sessionId]/page.tsx";
import Session from "./app/session/[sessionId]/page.tsx";
import SessionStatus from "./app/session/[sessionId]/status/page.tsx";
import DashboardLayout from "./app/dashboard/layout.tsx";
import Dashboard from "./app/dashboard/page.tsx";
import DashboardLogin from "./app/dashboard/login/page.tsx";
import DashboardVerify from "./app/dashboard/auth/verify/page.tsx";
import DashboardSession from "./app/dashboard/sessions/[id]/page.tsx";
import DashboardWallet from "./app/dashboard/wallet/page.tsx";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/agents" element={<Agents />} />
      <Route path="/checkout" element={<Checkout />} />
      <Route path="/custom-request" element={<CustomRequest />} />
      <Route path="/hire/:agent" element={<Hire />} />
      <Route path="/history" element={<History />} />
      <Route path="/report/:sessionId" element={<Report />} />
      <Route path="/session/:sessionId" element={<Session />} />
      <Route path="/session/:sessionId/status" element={<SessionStatus />} />
      <Route path="/dashboard" element={<DashboardLayout />}>
        <Route index element={<Dashboard />} />
        <Route path="login" element={<DashboardLogin />} />
        <Route path="auth/verify" element={<DashboardVerify />} />
        <Route path="wallet" element={<DashboardWallet />} />
        <Route path="sessions/:id" element={<DashboardSession />} />
      </Route>
    </Routes>
  );
}
