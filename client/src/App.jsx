import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { useState, useEffect, createContext } from 'react'
import { io } from 'socket.io-client'
import Home from './pages/Home'
import Room from './pages/Room'

export const SocketContext = createContext(null)
export const PlayerContext = createContext(null)

// Generate or retrieve a persistent device ID
function getDeviceId() {
  let deviceId = localStorage.getItem('kwizniac_device_id')
  if (!deviceId) {
    deviceId = crypto.randomUUID()
    localStorage.setItem('kwizniac_device_id', deviceId)
  }
  return deviceId
}

function App() {
  const [socket, setSocket] = useState(null)
  const [player, setPlayer] = useState(() => {
    // Restore nickname from sessionStorage if available
    const savedNickname = sessionStorage.getItem('kwizniac_nickname')
    return { id: null, nickname: savedNickname || '' }
  })

  // Persist nickname to sessionStorage when it changes
  useEffect(() => {
    if (player.nickname) {
      sessionStorage.setItem('kwizniac_nickname', player.nickname)
    }
  }, [player.nickname])

  useEffect(() => {
    const deviceId = getDeviceId()

    const newSocket = io(window.location.hostname === 'localhost'
      ? 'http://localhost:3001'
      : window.location.origin, {
      auth: { deviceId }
    })

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
