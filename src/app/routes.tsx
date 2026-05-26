import { Route, Routes } from 'react-router-dom';
import { DisplayApplicationPage } from '../features/application/display-application-page';
import { StudioPage } from './studio-page';

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<StudioPage />} />
      <Route path="/app-runtime/:launchId" element={<DisplayApplicationPage />} />
    </Routes>
  );
}
