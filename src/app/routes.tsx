import { createBrowserRouter } from "react-router";
import { JoinNodeScreen } from "./components/JoinNodeScreen";
import { Root } from "./components/Root";
import { AuthScreen } from "./components/AuthScreen";
import { PasswordRecoveryScreen } from "./components/PasswordRecoveryScreen";
import { OnboardingScreen } from "./components/OnboardingScreen";
import { DashboardScreen } from "./components/DashboardScreen";
import { EnvironmentalScreen } from "./components/EnvironmentalScreen";
import { ClinicalScreen } from "./components/ClinicalScreen";
import { SettingsScreen } from "./components/SettingsScreen";
import { DeviceConnectionScreen } from "./components/DeviceConnectionScreen";
import { AdminOverviewScreen } from "./components/AdminOverviewScreen";
import { AdminSensorDetailScreen } from "./components/AdminSensorDetailScreen";
import { AdminAnomalyInvestigationScreen } from "./components/AdminAnomalyInvestigationScreen";
import { AccessBoundary, AdminBoundary } from "./components/AccessBoundary";

export const router = createBrowserRouter([
  { path:"/join-node", Component:JoinNodeScreen },
  {
    path: "/",
    Component: AuthScreen,
  },
  {
    path: "/forgot-password",
    Component: PasswordRecoveryScreen,
  },
  {
    path: "/onboarding",
    element: <AccessBoundary><OnboardingScreen /></AccessBoundary>,
  },
  {
    path: "/device-connection",
    element: <AccessBoundary><DeviceConnectionScreen /></AccessBoundary>,
  },
  {
    path: "/admin/overview",
    element: <AdminBoundary><AdminOverviewScreen /></AdminBoundary>,
  },
  {
    path: "/admin/sensor-detail",
    element: <AdminBoundary><AdminSensorDetailScreen /></AdminBoundary>,
  },
  {
    path: "/admin/anomaly-investigation",
    element: <AdminBoundary><AdminAnomalyInvestigationScreen /></AdminBoundary>,
  },
  {
    path: "/app",
    element: <AccessBoundary><Root /></AccessBoundary>,
    children: [
      { index: true, Component: DashboardScreen },
      { path: "dashboard", Component: DashboardScreen },
      { path: "environmental", Component: EnvironmentalScreen },
      { path: "clinical", Component: ClinicalScreen },
      { path: "settings", Component: SettingsScreen },
    ],
  },
]);
