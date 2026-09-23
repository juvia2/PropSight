import './App.css'
import AuthGate from './AuthGate'
import Dashboard from './Dashboard'

export default function App() {
  return <AuthGate>{user => <Dashboard user={user} />}</AuthGate>
}
