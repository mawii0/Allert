import { createBrowserRouter } from "react-router";
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
import { AccessBoundary, AdminPreview } from "./components/AccessBoundary";

export const router = createBrowserRouter([
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
    element: <AdminPreview><AdminOverviewScreen /></AdminPreview>,
  },
  {
    path: "/admin/sensor-detail",
    element: <AdminPreview><AdminSensorDetailScreen /></AdminPreview>,
  },
  {
    path: "/admin/anomaly-investigation",
    element: <AdminPreview><AdminAnomalyInvestigationScreen /></AdminPreview>,
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
