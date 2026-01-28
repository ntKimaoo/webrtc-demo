import * as signalR from "@microsoft/signalr";

let connection = null;
let peerConnections = {};
let localStream = null;
let roomId = null;
let onRemoteStream = null;
let onParticipantJoined = null;
let onParticipantLeft = null;

// ICE servers configuration with TURN servers for NAT traversal (required for ngrok/public networks)
const config = {
  iceServers: [
    {
      urls: "stun:stun.l.google.com:19302",
    },
    {
      urls: "stun:stun1.l.google.com:19302",
    },
    {
      urls: "stun:stun2.l.google.com:19302",
    },
    {
      urls: "stun:stun3.l.google.com:19302",
    },
    {
      urls: "stun:stun4.l.google.com:19302",
    },
    // {
    //   urls: "stun:stun.relay.metered.ca:80",
    // },
    // {
    //   urls: "turn:global.relay.metered.ca:80",
    //   username: "c8af2a6d067a2d2bd56f1a64",
    //   credential: "EqNHfvLSLD6Udxsj",
    // },
    // {
    //   urls: "turn:global.relay.metered.ca:80?transport=tcp",
    //   username: "c8af2a6d067a2d2bd56f1a64",
    //   credential: "EqNHfvLSLD6Udxsj",
    // },
    // {
    //   urls: "turn:global.relay.metered.ca:443",
    //   username: "c8af2a6d067a2d2bd56f1a64",
    //   credential: "EqNHfvLSLD6Udxsj",
    // },
    // {
    //   urls: "turns:global.relay.metered.ca:443?transport=tcp",
    //   username: "c8af2a6d067a2d2bd56f1a64",
    //   credential: "EqNHfvLSLD6Udxsj",
    // },
  ],
  iceCandidatePoolSize: 10,
};

function getSignalRUrl() {
  if (import.meta.env.VITE_SIGNALR_URL) {
    return import.meta.env.VITE_SIGNALR_URL;
  }
  return "https://c2dbda157047.ngrok-free.app/webrtc";
}

// Khởi tạo SignalR connection
export async function initializeConnection() {
  if (connection && connection.state === signalR.HubConnectionState.Connected) {
    return connection;
  }

  const hubUrl = getSignalRUrl();
  console.log("Connecting to SignalR hub:", hubUrl);

  connection = new signalR.HubConnectionBuilder()
    .withUrl(hubUrl)
    .withAutomaticReconnect([0, 2000, 5000, 10000, 30000])
    .configureLogging(signalR.LogLevel.Information)
    .build();

  // Xử lý khi nhận signal từ server
  connection.on("ReceiveSignal", async (fromUserId, signal) => {
    console.log("Received signal from:", fromUserId, signal.type);

    try {
      if (signal.type === "offer") {
        await handleOffer(fromUserId, signal.offer);
      } else if (signal.type === "answer") {
        await handleAnswer(fromUserId, signal.answer);
      } else if (signal.type === "ice") {
        await handleIceCandidate(fromUserId, signal.candidate);
      }
    } catch (error) {
      console.error("Error handling signal:", error);
    }
  });

  // Xử lý danh sách users đã có trong room
  connection.on("ExistingUsers", async (userIds) => {
    console.log("Existing users in room:", userIds);
    // Tạo offer cho tất cả users đã có
    for (const userId of userIds) {
      await createPeerConnection(userId);
      await createOffer(userId);
      if (onParticipantJoined) {
        onParticipantJoined(userId);
      }
    }
  });

  // Xử lý khi có người tham gia mới
  connection.on("UserJoined", async (userId) => {
    console.log("User joined:", userId);
    if (onParticipantJoined) {
      onParticipantJoined(userId);
    }
    // User mới sẽ nhận được ExistingUsers và tạo offer
    // User cũ chỉ cần đợi offer từ user mới
  });

  // Xử lý khi có người rời đi
  connection.on("UserLeft", (userId) => {
    console.log("User left:", userId);
    if (peerConnections[userId]) {
      peerConnections[userId].close();
      delete peerConnections[userId];
    }
    if (onParticipantLeft) {
      onParticipantLeft(userId);
    }
  });

  // Handle reconnection
  connection.onreconnecting((error) => {
    console.log("SignalR reconnecting...", error);
  });

  connection.onreconnected((connectionId) => {
    console.log("SignalR reconnected with id:", connectionId);
    // Rejoin room on reconnect
    if (roomId) {
      connection.invoke("JoinRoom", roomId).catch(console.error);
    }
  });

  connection.onclose((error) => {
    console.log("SignalR connection closed:", error);
  });

  await connection.start();
  console.log("SignalR Connected successfully");
  return connection;
}

// Tạo peer connection cho một user
async function createPeerConnection(userId) {
  if (peerConnections[userId]) {
    // Close existing connection and create new one
    peerConnections[userId].close();
  }

  console.log("Creating peer connection for:", userId);
  const pc = new RTCPeerConnection(config);
  peerConnections[userId] = pc;

  // Thêm local stream tracks
  if (localStream) {
    localStream.getTracks().forEach(track => {
      console.log("Adding track to peer connection:", track.kind);
      pc.addTrack(track, localStream);
    });
  }

  // Xử lý ICE candidate
  pc.onicecandidate = (event) => {
    if (event.candidate) {
      console.log("Sending ICE candidate to:", userId);
      connection.invoke("SendSignal", roomId, userId, {
        type: "ice",
        candidate: event.candidate
      }).catch(console.error);
    }
  };

  // Log ICE gathering state
  pc.onicegatheringstatechange = () => {
    console.log(`ICE gathering state with ${userId}:`, pc.iceGatheringState);
  };

  // Log ICE connection state
  pc.oniceconnectionstatechange = () => {
    console.log(`ICE connection state with ${userId}:`, pc.iceConnectionState);

    // Handle failed connections
    if (pc.iceConnectionState === 'failed') {
      console.log("ICE connection failed, attempting restart...");
      pc.restartIce();
    }
  };

  // Xử lý remote stream
  pc.ontrack = (event) => {
    console.log("Received remote track from:", userId, event.track.kind);
    if (onRemoteStream && event.streams[0]) {
      onRemoteStream(userId, event.streams[0]);
    }
  };

  // Xử lý khi connection state thay đổi
  pc.onconnectionstatechange = () => {
    console.log(`Connection state with ${userId}:`, pc.connectionState);

    if (pc.connectionState === 'failed') {
      console.log("Connection failed with:", userId);
      // Notify about disconnection
      if (onParticipantLeft) {
        onParticipantLeft(userId);
      }
    }
  };

  // Handle negotiation needed (for renegotiation)
  pc.onnegotiationneeded = async () => {
    console.log("Negotiation needed with:", userId);
    // Only create offer if we're the polite peer (joined later)
  };

  return pc;
}

// Xử lý offer từ remote peer
async function handleOffer(fromUserId, offer) {
  console.log("Handling offer from:", fromUserId);
  const pc = await createPeerConnection(fromUserId);

  await pc.setRemoteDescription(new RTCSessionDescription(offer));
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);

  await connection.invoke("SendSignal", roomId, fromUserId, {
    type: "answer",
    answer: answer
  });
  console.log("Sent answer to:", fromUserId);
}

// Xử lý answer từ remote peer
async function handleAnswer(fromUserId, answer) {
  console.log("Handling answer from:", fromUserId);
  const pc = peerConnections[fromUserId];
  if (pc && pc.signalingState === "have-local-offer") {
    await pc.setRemoteDescription(new RTCSessionDescription(answer));
  } else {
    console.warn("Cannot set answer, signaling state:", pc?.signalingState);
  }
}

// Xử lý ICE candidate
async function handleIceCandidate(fromUserId, candidate) {
  const pc = peerConnections[fromUserId];
  if (pc && candidate) {
    try {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
      console.log("Added ICE candidate from:", fromUserId);
    } catch (error) {
      console.error("Error adding ICE candidate:", error);
    }
  }
}

// Tạo offer cho remote peer
async function createOffer(userId) {
  const pc = peerConnections[userId];
  if (!pc) return;

  console.log("Creating offer for:", userId);
  const offer = await pc.createOffer({
    offerToReceiveAudio: true,
    offerToReceiveVideo: true
  });
  await pc.setLocalDescription(offer);

  await connection.invoke("SendSignal", roomId, userId, {
    type: "offer",
    offer: offer
  });
  console.log("Sent offer to:", userId);
}

// Join room
export async function joinRoom(room, stream, callbacks = {}) {
  roomId = room;
  localStream = stream;
  onRemoteStream = callbacks.onRemoteStream;
  onParticipantJoined = callbacks.onParticipantJoined;
  onParticipantLeft = callbacks.onParticipantLeft;

  await initializeConnection();
  await connection.invoke("JoinRoom", roomId);
  console.log("Joined room:", roomId);
}

// Leave room
export async function leaveRoom() {
  if (connection && roomId) {
    try {
      await connection.invoke("LeaveRoom", roomId);
    } catch (error) {
      console.error("Error leaving room:", error);
    }
  }

  // Đóng tất cả peer connections
  Object.values(peerConnections).forEach(pc => pc.close());
  peerConnections = {};

  // Dừng local stream
  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
    localStream = null;
  }

  roomId = null;
}

// Toggle audio
export function toggleAudio(enabled) {
  if (localStream) {
    const audioTrack = localStream.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = enabled;
      console.log("Audio enabled:", enabled);
    }
  }
}

// Toggle video
export function toggleVideo(enabled) {
  if (localStream) {
    const videoTrack = localStream.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.enabled = enabled;
      console.log("Video enabled:", enabled);
    }
  }
}

// Get local stream
export async function getLocalStream(constraints = { video: true, audio: true }) {
  try {
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    localStream = stream;
    return stream;
  } catch (error) {
    console.error("Error accessing media devices:", error);
    throw error;
  }
}

// Get connection state
export function getConnectionState() {
  return connection?.state || "Disconnected";
}

// Get peer connection states
export function getPeerConnectionStates() {
  const states = {};
  Object.entries(peerConnections).forEach(([userId, pc]) => {
    states[userId] = {
      connectionState: pc.connectionState,
      iceConnectionState: pc.iceConnectionState,
      signalingState: pc.signalingState
    };
  });
  return states;
}