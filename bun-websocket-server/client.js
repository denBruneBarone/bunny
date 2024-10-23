// client.js

const socket = new WebSocket('ws://localhost:4040');
const audioPlayback = document.getElementById('audioPlayback');
const startRecordingButton = document.getElementById('startRecording');
const stopRecordingButton = document.getElementById('stopRecording');
const startListeningButton = document.getElementById('startListening');
const statusDiv = document.getElementById('status');

let localStream;
let mediaRecorder; // Use global variable for mediaRecorder
let isListening = false; // Flag to track if user pressed the Start Listening button
let senders = [];

let myPeerConnection = null;
createPeerConnection();

function sendToServer(msg) {
    const msgJSON = JSON.stringify(msg);
    socket.send(msgJSON);
}

function createPeerConnection() {
    myPeerConnection = new RTCPeerConnection({
        iceServers: [
            // Information about ICE servers - Use your own!
            {
                urls: "stun:stun.stunprotocol.org",
            },
        ],
    });

    myPeerConnection.onicecandidate = handleICECandidateEvent;
    myPeerConnection.ontrack = handleTrackEvent;
    myPeerConnection.onnegotiationneeded = handleNegotiationNeededEvent;
}

function handleICECandidateEvent(event) {
    if (event.candidate) {
        sendToServer({
            type: "new-ice-candidate",
            target: "server",
            candidate: event.candidate,
        });
    }
}

function handleTrackEvent(event) {
    console.log("Track event received:", event);
}

const setOpusAsPreferredCodec = (sdp) => {
    return sdp.replace(/m=audio (\d+) RTP\/SAVPF (\d+)/, 'm=audio $1 RTP/SAVPF 111');
};

function handleNegotiationNeededEvent() {
    myPeerConnection
        .createOffer()
        .then((offer) => {
            console.log("offer: " + offer);
            return myPeerConnection.setLocalDescription(offer);
        })
        .then(() => {
            sendToServer({
                name: "client",
                target: "server",
                type: "audio-offer",
                sdp: myPeerConnection.localDescription,
            });
            console.log("sdp: " + myPeerConnection.localDescription);
        })
        .catch(window.reportError);
}

socket.addEventListener('open', () => {
    console.log('Connected to the WebSocket server');
    startRecordingButton.addEventListener('click', startRecording);
    stopRecordingButton.addEventListener('click', stopRecording);
    startListeningButton.addEventListener('click', startListening);
});

socket.addEventListener('error', (error) => {
    console.error('WebSocket Error: ', error);
});

socket.addEventListener('close', () => {
    console.log('Disconnected from the WebSocket server');
});

// Start recording audio
async function startRecording() {
    const audioConstraints = {
        audio: {
            echoCancellation: true,
            noiseSuppression: true,
            sampleRate: 48000, // WebRTC typically uses 48kHz audio
        },
        video: false
    };

    // Request access to the microphone
    localStream = await navigator.mediaDevices.getUserMedia(audioConstraints);
    console.log("localStream:", localStream);
    console.log("localstream tracks:", localStream.getTracks());

    console.log("adding tracks:");
    localStream.getTracks().forEach(track => {
        const sender = myPeerConnection.addTrack(track, localStream);
        senders.push(sender);
    });

    // Create MediaRecorder to capture audio data
    mediaRecorder = new MediaRecorder(localStream); // Assign to the global variable

    // Log audio data when available
    mediaRecorder.ondataavailable = (event) => {
        console.log("\n\nEVENT FIRED!!!!");
        if (event.data.size > 0) { // Ensure there's data available
            const blob = new Blob([event.data], { type: 'audio/webm' });
            const arrayBuffer = new FileReader();

            arrayBuffer.onloadend = () => {
                const audioData = arrayBuffer.result;
                console.log("Audio Data (before sending):", audioData);

                // Optionally, you can convert the ArrayBuffer to a Uint8Array for easier inspection
                const uint8Array = new Uint8Array(audioData);
                console.log("Audio Data as Uint8Array:", uint8Array);
            };

            arrayBuffer.readAsArrayBuffer(blob);
        } else {
            console.log("No data available in the event.");
        }
    };

    // Start recording
    mediaRecorder.start(1000);
    console.log("Recording started...");
}

// Stop recording audio
function stopRecording() {
    if (mediaRecorder) {
        mediaRecorder.stop();
        console.log("Recording stopped.");
        
        // Remove tracks from the peer connection
        senders.forEach(sender => {
            myPeerConnection.removeTrack(sender);
        });

        // Clear the senders array
        senders = [];
        
        // Stop all tracks in the local stream
        localStream.getTracks().forEach(track => track.stop());
        
        console.log("Tracks removed from peer connection.");
        localStream = null
    }
}

// Start listening to the audio
function startListening() {
    isListening = true;
    startListeningButton.disabled = true; // Disable Start Listening button after pressed
    updateStatus('Listening to incoming audio');
}

// Update status messages
function updateStatus(message) {
    statusDiv.innerText = message;
}

myPeerConnection.addEventListener('track', async (event) => {
    const [remoteStream] = event.streams;
    audioPlayback.srcObject = remoteStream; // Play the incoming audio
});

// Handle incoming audio stream
socket.addEventListener('message', (event) => {
    if (!isListening) {
        console.log('Audio data received but not listening. Ignoring.');
        return;
    }
    console.log("event:", event);
    const data = JSON.parse(event.data);
    handleAudioAnswerMsg(data);
});

function handleAudioAnswerMsg(msg) {
    console.log("\nmsg:", msg);
    const desc = new RTCSessionDescription(msg.sdp);
    myPeerConnection.setRemoteDescription(desc).catch(window.reportError);
}

audioPlayback.addEventListener('error', (e) => {
    console.error('Audio Playback Error:', e);
    console.error('Error Code:', audioPlayback.error.code);
});
