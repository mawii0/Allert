import { RouterProvider } from 'react-router';
import { router } from './routes';
import { ConnectionStatus } from './components/AppInstallation';

export default function App() {
  return <><ConnectionStatus /><RouterProvider router={router} /></>;
}
