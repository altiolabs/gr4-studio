import { Route, Routes } from 'react-router-dom';
import { StudioPage } from './studio-page';

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<StudioPage />} />
    </Routes>
  );
}
