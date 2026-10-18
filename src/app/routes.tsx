import { lazy } from "react";
import { createBrowserRouter } from "react-router";
const JoinNodeScreen = lazy(() => import("./components/JoinNodeScreen").then(module => ({ default: module.JoinNodeScreen })));
import { Root } from "./components/Root";
const AuthScreen = lazy(() => import("./components/AuthScreen").then(module => ({ default: module.AuthScreen })));
const PasswordRecoveryScreen = lazy(() => import("./components/PasswordRecoveryScreen").then(module => ({ default: module.PasswordRecoveryScreen })));
const VerifyEmailScreen = lazy(() => import("./components/VerifyEmailScreen").then(module => ({ default: module.VerifyEmailScreen })));
const OnboardingScreen = lazy(() => import("./components/OnboardingScreen").then(module => ({ default: module.OnboardingScreen })));
const DashboardScreen = lazy(() => import("./components/DashboardScreen").then(module => ({ default: module.DashboardScreen })));
const EnvironmentalScreen = lazy(() => import("./components/EnvironmentalScreen").then(module => ({ default: module.EnvironmentalScreen })));
const SensorNoticesScreen = lazy(() => import("./components/SensorNoticesScreen").then(module => ({ default: module.SensorNoticesScreen })));
const ClinicalScreen = lazy(() => import("./components/ClinicalScreen").then(module => ({ default: module.ClinicalScreen })));
const SettingsScreen = lazy(() => import("./components/SettingsScreen").then(module => ({ default: module.SettingsScreen })));
const DeviceConnectionScreen = lazy(() => import("./components/DeviceConnectionScreen").then(module => ({ default: module.DeviceConnectionScreen })));
const AdminOverviewScreen = lazy(() => import("./components/AdminOverviewScreen").then(module => ({ default: module.AdminOverviewScreen })));
const AdminSensorDetailScreen = lazy(() => import("./components/AdminSensorDetailScreen").then(module => ({ default: module.AdminSensorDetailScreen })));
const AdminAnomalyInvestigationScreen = lazy(() => import("./components/AdminAnomalyInvestigationScreen").then(module => ({ default: module.AdminAnomalyInvestigationScreen })));
import { AccessBoundary, AdminBoundary } from "./components/AccessBoundary";

function RouteLoadError() {
  return <main className="min-h-screen bg-zinc-950 p-8 text-white"><h1>ALLERT could not open this screen</h1><p className="mt-3">Check your connection and reload. Changes that were not saved may need to be entered again.</p><button className="mt-4 text-emerald-400 underline" onClick={() => window.location.reload()}>Reload ALLERT</button></main>;
}
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
    path: "/verify-email",
    Component: VerifyEmailScreen,
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
      { path: "sensor-notices", Component: SensorNoticesScreen },
      { path: "clinical", Component: ClinicalScreen },
      { path: "settings", Component: SettingsScreen },
    ],
  },
].map(route => ({ ...route, errorElement: <RouteLoadError /> })));
