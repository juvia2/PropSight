import './App.css'
import './Workspace.css'
import './ListingReference.css'
import './AuthDesign.css'
import AuthGate from './AuthGate'
import Dashboard from './Dashboard'

export default function App() {
  return <AuthGate>{(user, account) => <Dashboard user={user} account={account} />}</AuthGate>
}
