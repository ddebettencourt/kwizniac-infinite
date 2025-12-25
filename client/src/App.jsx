import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { useState, useEffect, createContext } from 'react'
import { io } from 'socket.io-client'
import Home from './pages/Home'
import Room from './pages/Room'

export const SocketContext = createContext(null)
export const PlayerContext = createContext(null)

function App() {
  const [socket, setSocket] = useState(null)
  const [player, setPlayer] = useState({ id: null, nickname: '' })

  useEffect(() => {
    const newSocket = io(window.location.hostname === 'localhost'
      ? 'http://localhost:3001'
      : window.location.origin)

    setSocket(newSocket)

    return () => {
      newSocket.close()
    }
  }, [])

  return (
    <SocketContext.Provider value={socket}>
      <PlayerContext.Provider value={{ player, setPlayer }}>
        <div className="min-h-screen relative">
          {/* CRT overlay effect */}
          <div className="crt-overlay" />
          <div className="vignette" />

          {/* Spotlight effect */}
          <div className="fixed inset-0 bg-spotlight pointer-events-none" />

          <BrowserRouter>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/room/:roomId" element={<Room />} />
            </Routes>
          </BrowserRouter>
        </div>
      </PlayerContext.Provider>
    </SocketContext.Provider>
  )
}

export default App
