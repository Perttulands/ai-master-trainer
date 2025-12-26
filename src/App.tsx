import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AppLayout } from './components/layout/AppLayout';
import { Home } from './pages/Home';
import { NewSession } from './pages/NewSession';
import { Training } from './pages/Training';
import { History } from './pages/History';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<Home />} />
          <Route path="/new" element={<NewSession />} />
          <Route path="/session/:id" element={<Training />} />
          <Route path="/session/:id/history" element={<History />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
