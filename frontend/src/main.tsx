import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { MockAuthProvider } from './auth/MockAuthProvider.tsx'
import { AmplifyAuthProvider } from './auth/AmplifyAuthProvider.tsx'

const useMock = import.meta.env.VITE_USE_MOCK_COGNITO !== 'false';

// MOCK を使うか実環境 (Amplify) を使うかを切り替え
const AuthProvider = useMock ? MockAuthProvider : AmplifyAuthProvider;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>,
)
