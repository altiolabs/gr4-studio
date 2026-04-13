import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, HashRouter } from 'react-router-dom';
import { ReactFlowProvider } from '@xyflow/react';
import { AppRoutes } from './app/routes';
import './styles/index.css';

const queryClient = new QueryClient();
const Router = window.location.protocol === 'file:' ? HashRouter : BrowserRouter;

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <Router>
        <ReactFlowProvider>
          <AppRoutes />
        </ReactFlowProvider>
      </Router>
    </QueryClientProvider>
  </React.StrictMode>,
);
