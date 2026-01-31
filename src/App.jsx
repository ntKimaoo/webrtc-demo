import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  Phone,
  PhoneOff,
  Users,
  User,
  Settings,
  Copy,
  Check,
  Wifi,
  WifiOff,
  RefreshCw,
} from "lucide-react";
import * as webrtc from "./webrtc";

function App() {
  const [isInCall, setIsInCall] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [callType, setCallType] = useState("group");
  const [roomId, setRoomId] = useState("");
  const [participants, setParticipants] = useState([]);
  const [showSettings, setShowSettings] = useState(false);
  const [copied, setCopied] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState("disconnected");
  const [error, setError] = useState(null);

  const localVideoRef = useRef(null);
  const remoteVideosRef = useRef({});
  const localStreamRef = useRef(null);

  // Generate a random room ID
  const generateRoomId = () => {
    const chars = 'abcdefghijklmnopqrstuvwxyz';
    let result = '';
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      if (i < 2) result += '-';
    }
    setRoomId(result);
  };

  const copyRoomId = () => {
    navigator.clipboard.writeText(roomId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const startCall = async () => {
    if (!roomId) {
      setError("Vui lòng nhập ID phòng");
      return;
    }

    setError(null);
    setConnectionStatus("connecting");

    try {
      const stream = await webrtc.getLocalStream({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: "user"
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      localStreamRef.current = stream;
      setIsInCall(true);

      setTimeout(() => {
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }
      }, 100);

      // Join room với callbacks
      await webrtc.joinRoom(roomId, stream, {
        onRemoteStream: (userId, remoteStream) => {
          console.log("Remote stream from:", userId);
          setConnectionStatus("connected");

          // Tạo video element cho remote user
          setParticipants((prev) => {
            const existing = prev.find((p) => p.id === userId);
            if (existing) {
              // Update stream if already exists
              return prev.map(p =>
                p.id === userId ? { ...p, stream: remoteStream } : p
              );
            }
            return [...prev, { id: userId, stream: remoteStream }];
          });
        },
        onParticipantJoined: (userId) => {
          console.log("Participant joined:", userId);
        },
        onParticipantLeft: (userId) => {
          console.log("Participant left:", userId);
          setParticipants((prev) => prev.filter((p) => p.id !== userId));
        },
      });

      setConnectionStatus("connected");
    } catch (error) {
      console.error("Lỗi khi truy cập media:", error);
      setConnectionStatus("error");
      setError("Không thể truy cập camera/mic. Vui lòng kiểm tra quyền truy cập.");
      setIsInCall(false);
    }
  };

  const endCall = async () => {
    try {
      await webrtc.leaveRoom();
    } catch (e) {
      console.error("Error leaving room:", e);
    }

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }

    setIsInCall(false);
    setParticipants([]);
    setConnectionStatus("disconnected");
  };

  const toggleMute = () => {
    const newMutedState = !isMuted;
    setIsMuted(newMutedState);
    webrtc.toggleAudio(!newMutedState);
  };

  const toggleVideo = () => {
    const newVideoState = !isVideoOff;
    setIsVideoOff(newVideoState);
    webrtc.toggleVideo(!newVideoState);
  };

  // Cập nhật video elements khi có participants mới
  useEffect(() => {
    participants.forEach((participant) => {
      const videoElement = remoteVideosRef.current[participant.id];
      if (videoElement && participant.stream) {
        videoElement.srcObject = participant.stream;
      }
    });
  }, [participants]);

  return (
    <>
      <style>{`
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }

        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
        }

        .app-container {
          min-height: 100vh;
          background: linear-gradient(135deg, #1a1a2e 0%, #4a1a4a 50%, #1a1a2e 100%);
          color: white;
        }

        .waiting-screen {
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
          padding: 20px;
        }

        .card {
          background: rgba(31, 41, 55, 0.5);
          backdrop-filter: blur(10px);
          border-radius: 16px;
          padding: 40px;
          max-width: 450px;
          width: 100%;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
          border: 1px solid rgba(75, 85, 99, 0.5);
        }

        .title {
          font-size: 32px;
          font-weight: bold;
          text-align: center;
          margin-bottom: 40px;
          background: linear-gradient(135deg, #a78bfa 0%, #ec4899 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .form-group {
          margin-bottom: 24px;
        }

        .form-label {
          display: block;
          font-size: 14px;
          font-weight: 500;
          margin-bottom: 8px;
        }

        .form-input {
          width: 100%;
          padding: 12px 16px;
          background: rgba(55, 65, 81, 0.5);
          border: 1px solid #4b5563;
          border-radius: 8px;
          color: white;
          font-size: 16px;
          transition: all 0.3s;
        }

        .form-input:focus {
          outline: none;
          border-color: #a78bfa;
          box-shadow: 0 0 0 3px rgba(167, 139, 250, 0.2);
        }

        .form-input::placeholder {
          color: #9ca3af;
        }

        .call-type-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
          margin-top: 12px;
        }

        .call-type-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 12px 16px;
          background: rgba(55, 65, 81, 0.5);
          border: 2px solid #4b5563;
          border-radius: 8px;
          color: white;
          font-size: 16px;
          cursor: pointer;
          transition: all 0.3s;
        }

        .call-type-btn:hover {
          border-color: #6b7280;
        }

        .call-type-btn.active {
          background: #7c3aed;
          border-color: #a78bfa;
        }

        .start-btn {
          width: 100%;
          background: linear-gradient(135deg, #7c3aed 0%, #db2777 100%);
          border: none;
          padding: 16px 24px;
          border-radius: 8px;
          color: white;
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          transition: all 0.3s;
        }

        .start-btn:hover {
          transform: scale(1.05);
          box-shadow: 0 10px 30px rgba(124, 58, 237, 0.4);
        }

        .call-screen {
          height: 100vh;
          display: flex;
          flex-direction: column;
        }

        .header {
          background: rgba(17, 24, 39, 0.8);
          backdrop-filter: blur(10px);
          padding: 16px 24px;
          border-bottom: 1px solid #374151;
        }

        .header-content {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .header-title {
          font-size: 20px;
          font-weight: 600;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .copy-btn {
          padding: 4px 8px;
          background: rgba(124, 58, 237, 0.3);
          border: 1px solid #7c3aed;
          border-radius: 6px;
          color: white;
          cursor: pointer;
          font-size: 12px;
          display: flex;
          align-items: center;
          gap: 4px;
          transition: all 0.3s;
        }

        .copy-btn:hover {
          background: rgba(124, 58, 237, 0.5);
        }

        .header-subtitle {
          font-size: 14px;
          color: #9ca3af;
          margin-top: 4px;
        }

        .settings-btn {
          padding: 8px;
          background: transparent;
          border: none;
          color: white;
          cursor: pointer;
          border-radius: 8px;
          transition: background 0.3s;
        }

        .settings-btn:hover {
          background: #374151;
        }

        .video-container {
          flex: 1;
          padding: 16px;
          overflow: auto;
        }

        .video-grid {
          height: 100%;
          display: grid;
          gap: 16px;
          min-height: 400px;
        }

        .video-grid.single {
          grid-template-columns: 1fr;
          grid-template-rows: 1fr;
        }

        .video-grid.two {
          grid-template-columns: 1fr 1fr;
          grid-template-rows: 1fr;
        }

        .video-grid.four {
          grid-template-columns: 1fr 1fr;
          grid-template-rows: 1fr 1fr;
        }

        .video-box {
          position: relative;
          background: #1f2937;
          border-radius: 12px;
          overflow: hidden;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
          min-height: 300px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .video-element {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }

        .video-off-overlay {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #111827;
        }

        .video-off-content {
          text-align: center;
        }

        .avatar {
          width: 96px;
          height: 96px;
          background: #7c3aed;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 12px;
        }

        .video-label {
          position: absolute;
          bottom: 16px;
          left: 16px;
          background: rgba(0, 0, 0, 0.7);
          padding: 6px 12px;
          border-radius: 20px;
          font-size: 14px;
        }

        .waiting-box {
          background: #1f2937;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .waiting-content {
          text-align: center;
          color: #9ca3af;
        }

        .waiting-icon {
          margin: 0 auto 8px;
        }

        .pulse {
          animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        }

        @keyframes pulse {
          0%, 100% {
            opacity: 1;
          }
          50% {
            opacity: 0.5;
          }
        }

        .controls {
          background: rgba(17, 24, 39, 0.8);
          backdrop-filter: blur(10px);
          padding: 24px;
          border-top: 1px solid #374151;
        }

        .controls-inner {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 16px;
        }

        .control-btn {
          padding: 16px;
          border-radius: 50%;
          border: none;
          color: white;
          cursor: pointer;
          transition: all 0.3s;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .control-btn:hover {
          transform: scale(1.1);
        }

        .control-btn.default {
          background: #374151;
        }

        .control-btn.default:hover {
          background: #4b5563;
        }

        .control-btn.danger {
          background: #dc2626;
        }

        .control-btn.danger:hover {
          background: #b91c1c;
        }
      `}</style>

      <div className="app-container">
        {!isInCall ? (
          <div className="waiting-screen">
            <div className="card">
              <h1 className="title">WebRTC Video Call</h1>

              <div className="form-group">
                <label className="form-label">ID Phòng</label>
                <div style={{ display: "flex", gap: "8px" }}>
                  <input
                    type="text"
                    value={roomId}
                    onChange={(e) => setRoomId(e.target.value)}
                    placeholder="Nhập hoặc tạo ID phòng..."
                    className="form-input"
                    style={{ flex: 1 }}
                  />
                  <button
                    onClick={generateRoomId}
                    className="start-btn"
                    style={{
                      width: "auto",
                      padding: "12px 16px",
                      fontSize: "14px"
                    }}
                    type="button"
                  >
                    <RefreshCw size={18} />
                    Tạo ID
                  </button>
                </div>
                {error && (
                  <p style={{
                    fontSize: "14px",
                    color: "#ef4444",
                    marginTop: "8px",
                    background: "rgba(239, 68, 68, 0.1)",
                    padding: "8px 12px",
                    borderRadius: "6px"
                  }}>
                    ⚠️ {error}
                  </p>
                )}
                <p
                  style={{
                    fontSize: "12px",
                    color: "#9ca3af",
                    marginTop: "8px",
                  }}
                >
                  💡 Chia sẻ ID này để người khác tham gia cùng phòng
                </p>
              </div>

              <button onClick={startCall} className="start-btn">
                <Phone size={20} />
                Bắt đầu cuộc gọi
              </button>
            </div>
          </div>
        ) : (
          <div className="call-screen">
            <div className="header">
              <div className="header-content">
                <div>
                  <div className="header-title">
                    Phòng: {roomId}
                    <button onClick={copyRoomId} className="copy-btn">
                      {copied ? <Check size={14} /> : <Copy size={14} />}
                      {copied ? "Đã sao chép!" : "Sao chép"}
                    </button>
                  </div>
                  <p className="header-subtitle">
                    {callType === "1v1" ? "Cuộc gọi 1-1" : "Cuộc gọi nhóm"} •{" "}
                    {participants.length + 1} người tham gia
                    <span style={{
                      marginLeft: "12px",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "4px",
                      color: connectionStatus === "connected" ? "#22c55e" :
                        connectionStatus === "connecting" ? "#eab308" : "#ef4444"
                    }}>
                      {connectionStatus === "connected" ? (
                        <><Wifi size={14} /> Đã kết nối</>
                      ) : connectionStatus === "connecting" ? (
                        <><RefreshCw size={14} className="pulse" /> Đang kết nối...</>
                      ) : (
                        <><WifiOff size={14} /> Mất kết nối</>
                      )}
                    </span>
                  </p>
                </div>
                <button
                  onClick={() => setShowSettings(!showSettings)}
                  className="settings-btn"
                >
                  <Settings size={24} />
                </button>
              </div>
            </div>

            <div className="video-container">
              <div
                className={`video-grid ${participants.length === 0
                  ? "single"
                  : participants.length === 1
                    ? "two"
                    : "four"
                  }`}
              >
                <div className="video-box">
                  <video
                    ref={localVideoRef}
                    autoPlay
                    muted
                    playsInline
                    className="video-element"
                  />
                  {isVideoOff && (
                    <div className="video-off-overlay">
                      <div className="video-off-content">
                        <div className="avatar">
                          <User size={48} />
                        </div>
                        <p>Bạn</p>
                      </div>
                    </div>
                  )}
                  <div className="video-label">
                    Bạn {isMuted && "(Tắt tiếng)"}
                  </div>
                </div>

                {participants.map((participant) => (
                  <div key={participant.id} className="video-box">
                    <video
                      ref={(el) =>
                        (remoteVideosRef.current[participant.id] = el)
                      }
                      autoPlay
                      playsInline
                      className="video-element"
                    />
                    <div className="video-label">
                      Người tham gia {participant.id.substring(0, 6)}
                    </div>
                  </div>
                ))}

                {participants.length === 0 && (
                  <div className="waiting-box">
                    <div className="waiting-content">
                      <Phone size={48} className="waiting-icon pulse" />
                      <p>Đang chờ người tham gia...</p>
                      <p style={{ fontSize: "12px", marginTop: "8px" }}>
                        Chia sẻ ID phòng: <strong>{roomId}</strong>
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="controls">
              <div className="controls-inner">
                <button
                  onClick={toggleMute}
                  className={`control-btn ${isMuted ? "danger" : "default"}`}
                >
                  {isMuted ? <MicOff size={24} /> : <Mic size={24} />}
                </button>

                <button
                  onClick={toggleVideo}
                  className={`control-btn ${isVideoOff ? "danger" : "default"}`}
                >
                  {isVideoOff ? <VideoOff size={24} /> : <Video size={24} />}
                </button>

                <button onClick={endCall} className="control-btn danger">
                  <PhoneOff size={24} />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

export default App;
