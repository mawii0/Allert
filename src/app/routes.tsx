import { createBrowserRouter } from "react-router";
import { Root } from "./components/Root";
import { AuthScreen } from "./components/AuthScreen";
import { OnboardingScreen } from "./components/OnboardingScreen";
import { DashboardScreen } from "./components/DashboardScreen";
import { EnvironmentalScreen } from "./components/EnvironmentalScreen";
import { ClinicalScreen } from "./components/ClinicalScreen";
import { SettingsScreen } from "./components/SettingsScreen";
import { DeviceConnectionScreen } from "./components/DeviceConnectionScreen";
import { AdminOverviewScreen } from "./components/AdminOverviewScreen";
import { AdminSensorDetailScreen } from "./components/AdminSensorDetailScreen";
import { AdminAnomalyInvestigationScreen } from "./components/AdminAnomalyInvestigationScreen";

export const router = createBrowserRouter([
  {
    path: "/",
    Component: AuthScreen,
  },
  {
    path: "/onboarding",
    Component: OnboardingScreen,
  },
  {
    path: "/device-connection",
    Component: DeviceConnectionScreen,
  },
  {
    path: "/admin/overview",
    Component: AdminOverviewScreen,
  },
  {
    path: "/admin/sensor-detail",
    Component: AdminSensorDetailScreen,
  },
  {
    path: "/admin/anomaly-investigation",
    Component: AdminAnomalyInvestigationScreen,
  },
  {
    path: "/app",
    Component: Root,
    children: [
      { index: true, Component: DashboardScreen },
      { path: "dashboard", Component: DashboardScreen },
      { path: "environmental", Component: EnvironmentalScreen },
      { path: "clinical", Component: ClinicalScreen },
      { path: "settings", Component: SettingsScreen },
    ],
  },
]);
