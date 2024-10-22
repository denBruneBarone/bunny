// client.js

const socket = new WebSocket('ws://localhost:4040');
const audioPlayback = document.getElementById('audioPlayback');
const startRecordingButton = document.getElementById('startRecording');
const stopRecordingButton = document.getElementById('stopRecording');
const startListeningButton = document.getElementById('startListening');
const statusDiv = document.getElementById('status');

let localStream;
let mediaRecorder;
let isListening = false; // Flag to track if user pressed the Start Listening button



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
    // Request access to the microphone
    localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });

    const options = { mimeType: 'audio/webm; codecs=opus'};

    mediaRecorder = new MediaRecorder(localStream, options);

    
    
    // When sending audio data to the server
    mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
            console.log("Sending audio data of size: ", event.data.size, " and type: ", event.data.type);
            socket.send(event.data);
        }
    };


    mediaRecorder.onstart = () => {
        console.log('Recording started');
        updateStatus('Recording started');
        startRecordingButton.disabled = true;
        stopRecordingButton.disabled = false;
    };

    mediaRecorder.onstop = () => {
        console.log('Recording stopped');
        localStream.getTracks().forEach(track => track.stop());
        updateStatus('Recording stopped');
        startRecordingButton.disabled = false;
        stopRecordingButton.disabled = true;
    };

    mediaRecorder.start();
}

// Stop recording audio
function stopRecording() {
    if (mediaRecorder) {
        mediaRecorder.stop();
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

// Handle incoming audio stream
socket.addEventListener('message', (event) => {
    if (!isListening) {
        // If the user has not pressed "Start Listening", ignore the audio data
        console.log('Audio data received but not listening. Ignoring.');
        return;
    }
    console.log("event:")
    console.log(event)

    const audioBlob = new Blob([event.data], { type: 'audio/webm; codecs=opus' }); 

    console.log('Received Blob:');
    console.log(audioBlob)
    console.log('Blob size:', audioBlob.size);
    console.log('Blob type:', audioBlob.type);

    if (audioBlob.size > 0 && audioBlob.type) {
        const audioUrl = URL.createObjectURL(audioBlob);
        audioPlayback.src = audioUrl;
        console.log(`audioUrl: "${audioUrl}"`)
        
        audioPlayback.play().catch((error) => {
            console.error('Playback failed:', error);
            console.log("error code", error.code) 
        });
    } else {
        console.error('Received empty Blob or unsupported type');
    }
});



audioPlayback.addEventListener('error', (e) => {
    console.error('Audio Playback Error NEEEEWWWWW ERRORRR:', e);
    console.error('Error Code:', audioPlayback.error.code);
});
