import { Component, Suspense, type ReactNode } from 'react';
import { RouterProvider } from 'react-router';
import { router } from './routes';
import { ConnectionStatus } from './components/AppInstallation';

class RouteLoadBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) return <main className="min-h-screen bg-zinc-950 p-8 text-white"><h1>ALLERT could not open this screen</h1><p className="mt-3">Check your connection and reload. Changes that were not saved may need to be entered again.</p><button className="mt-4 text-emerald-400 underline" onClick={() => window.location.reload()}>Reload ALLERT</button></main>;
    return this.props.children;
  }
}
export default function App() {
  return <><ConnectionStatus /><RouteLoadBoundary><Suspense fallback={<p role="status" className="min-h-screen bg-zinc-950 p-8 text-zinc-300">Opening ALLERT…</p>}><RouterProvider router={router} /></Suspense></RouteLoadBoundary></>;
}
