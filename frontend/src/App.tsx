import React from 'react';
import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import Settings from './pages/Settings';
import Library from './pages/Library';
import { SettingsProvider } from './contexts/SettingsContext';
import { AppProvider } from './contexts/AppContext';
import './App.css';

function App() {
  return (
    <BrowserRouter>
      <AppProvider>
        <SettingsProvider>
          <div className="main-card" style={{ maxWidth: '1200px', margin: '0 auto' }}>
            <header className="app-header">
              <h1 className="app-title">OpusFactory</h1>
              <p className="app-subtitle">Clone do OpusClip com IA</p>
              
              <nav style={{ 
                display: 'flex', 
                gap: '10px', 
                justifyContent: 'center',
                marginTop: '20px',
                padding: '4px',
                backgroundColor: '#1E293B',
                borderRadius: '40px',
                border: '1px solid #334155'
              }}>
                <NavLink 
                  to="/" 
                  style={({ isActive }) => ({
                    color: isActive ? '#F1F5F9' : '#94A3B8',
                    textDecoration: 'none',
                    fontWeight: 500,
                    padding: '8px 20px',
                    borderRadius: '30px',
                    backgroundColor: isActive ? '#3B82F6' : 'transparent',
                    transition: 'all 0.2s'
                  })}
                >
                  📊 Dashboard
                </NavLink>
                <NavLink 
                  to="/library" 
                  style={({ isActive }) => ({
                    color: isActive ? '#F1F5F9' : '#94A3B8',
                    textDecoration: 'none',
                    fontWeight: 500,
                    padding: '8px 20px',
                    borderRadius: '30px',
                    backgroundColor: isActive ? '#3B82F6' : 'transparent'
                  })}
                >
                  📚 Biblioteca
                </NavLink>
                <NavLink 
                  to="/settings" 
                  style={({ isActive }) => ({
                    color: isActive ? '#F1F5F9' : '#94A3B8',
                    textDecoration: 'none',
                    fontWeight: 500,
                    padding: '8px 20px',
                    borderRadius: '30px',
                    backgroundColor: isActive ? '#3B82F6' : 'transparent'
                  })}
                >
                  ⚙️ Configurações
                </NavLink>
              </nav>
            </header>

            <div style={{ marginTop: '30px' }}>
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/library" element={<Library />} />
                <Route path="/settings" element={<Settings />} />
              </Routes>
            </div>
          </div>
        </SettingsProvider>
      </AppProvider>
    </BrowserRouter>
  );
}

export default App;