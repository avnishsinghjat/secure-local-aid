import { Navigate } from 'react-router-dom';

// Index page redirects to dashboard (handled by App layout)
export default function Index() {
  return <Navigate to="/" replace />;
}
