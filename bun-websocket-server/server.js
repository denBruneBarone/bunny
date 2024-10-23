// server.js
import { serve } from 'bun';
import { WebSocketServer } from 'ws';
import path from 'path';
import fs from 'fs/promises';
import realfs from 'fs';
import {RTCPeerConnection} from 'wrtc'
import {RTCSessionDescription} from 'wrtc'
import {RTCIceCandidate} from 'wrtc'
import MediaRecorder from 'webrtc'
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
import {exec} from 'child_process'
import { Readable } from 'stream';
import {MediaStream} from 'wrtc'
const { RTCAudioSink } = require ('wrtc').nonstandard;
const { RTCAudioSource } = require ('wrtc').nonstandard;


var RecordRTC = require('recordrtc');

const PORT = 8000;
const WS_PORT = 4040;
const wss = new WebSocketServer({ port: WS_PORT });
const clients = new Set(); // Keep track of connected clients
let myPeerConnection = null
let targetUsername = ""
let audioChunks = []; // Define this globally
let recordingInterval; // Define this globally

const audioFolder = path.join(__dirname, 'audio');
if (!realfs.existsSync(audioFolder)) {
    realfs.mkdirSync(audioFolder);
}


wss.on('connection', (ws) => {
    console.log('socket Client connected');
    clients.add(ws); // Add the new client to the set

    ws.on('message', (message) => {
        const msg = JSON.parse(message)
        if (msg.type == "new-ice-candidate") handleNewICECandidateMsg(msg)
        if (msg.type == "audio-offer") handleAudioOfferMsg(msg)

        
        clients.forEach(client => {
            if (client !== ws && client.readyState === client.OPEN) {
                return
            }
        });
    })
    ws.on('close', () => {
        console.log('Client disconnected');
        clients.delete(ws); // Remove client from the set
    });

function createPeerConnection() {
    myPeerConnection = new RTCPeerConnection({
      iceServers: [
        // Information about ICE servers - Use your own!
        {
          urls: "stun:stun.stunprotocol.org",
        },
      ],
    });
    
    myPeerConnection.ontrack = handleTrackEvent;
}

function handleTrackEvent(event) {
    console.log("event");
    console.log(event);

    // Create an RTCAudioSource
    const audioSource = new RTCAudioSource();
    
    // Get the audio track from the event
    const audioTrack = event.track;

    // Connect the audio track to the audio source
    audioSource.track = audioTrack;

    // Create a new MediaStreamTrack from the audio source
    const newAudioTrack = audioSource.createTrack();

    // Optionally, you can choose to pass either track to the startRecording function
    // For example, you can pass the new audio track:
    // startRecording(newAudioTrack);
    
    // Or, you can pass the original audio track:
    startRecording(audioTrack);
}

function startRecording(mediaStreamTrack) {
    console.log("start recording...");
    console.log('Track kind:', mediaStreamTrack.kind);
    console.log('Track ID:', mediaStreamTrack.id);
    console.log('Track enabled:', mediaStreamTrack.enabled);
    console.log('Track muted:', mediaStreamTrack.muted);
    console.log('Track readyState:', mediaStreamTrack.readyState);
    
    audioChunks = [];
    clearInterval(recordingInterval);

    const audioSink = new RTCAudioSink(mediaStreamTrack);

    const readableStream = new Readable({
        read() {}
    });

    recordingInterval = setInterval(() => {
        saveAudioChunks(readableStream);
    }, 3000); // Save audio every 3 seconds

    audioSink.ondata = (data) => {
        // Convert Float32Array samples to Int16Array
        const floatSamples = data.samples;
        const int16Samples = new Int16Array(floatSamples.length);

        // console.log("data")
        // console.log(data)

        for (let i = 0; i < floatSamples.length; i++) {
            // Scale the float value to the 16-bit PCM range
            int16Samples[i] = Math.max(-32768, Math.min(32767, floatSamples[i] * 32768));
        }

        // Create a buffer from the Int16Array
        const buffer = Buffer.from(int16Samples.buffer);
        // console.log("buffer")
        // console.log(buffer)
        audioChunks.push(buffer);
        readableStream.push(buffer); // Push the converted audio data to the readable stream
    };

    mediaStreamTrack.onended = () => {
        clearInterval(recordingInterval);
        audioSink.stop();
        console.log('Audio track ended.');
        readableStream.push(null);
    };
}

function saveAudioChunks(readableStream) {
    if (audioChunks.length === 0) return; // No audio data to save

    const filePath = path.join(audioFolder, `audio_${Date.now()}.webm`);

    const sampleRate = 48000; // WebRTC typically uses a sample rate of 48kHz
    const channels = 1; // Mono audio

    const ffmpeg = exec(`${ffmpegPath} -f s16le -ar ${sampleRate} -ac ${channels} -i pipe:0 -c:a libopus ${filePath}`, {
        stdio: ['pipe', 'inherit', 'inherit']
    });

    readableStream.pipe(ffmpeg.stdin);

    ffmpeg.on('exit', (code) => {
        console.log(`FFmpeg exited with code ${code}, saved to ${filePath}`);
    });

    ffmpeg.on('error', (err) => {
        console.error('Error saving audio stream:', err);
    });

    audioChunks = [];
}




function handleAudioOfferMsg(msg) {
    targetUsername = msg.name;
    createPeerConnection();
  
    const desc = new RTCSessionDescription(msg.sdp);
  
    myPeerConnection
      .setRemoteDescription(desc)
      .then(() => myPeerConnection.createAnswer())
      .then((answer) => myPeerConnection.setLocalDescription(answer))
      .then(() => {
        const msg = {
          name: "server",
          target: "client",
          type: "audio-answer",
          sdp: myPeerConnection.localDescription,
        };
        ws.send(JSON.stringify(msg));
      })
  }
    

  function handleNewICECandidateMsg(msg) {
    const candidate = new RTCIceCandidate(msg.candidate);
  
    myPeerConnection.addIceCandidate(candidate).catch((error) => {
        console.log("error: " + error)
        console.log("could not add Ice candidate: ")
        console.log(candidate)
    });
    console.log("\n added candidate!!!")
  }
})

  




serve({
    port: PORT,
    async fetch(req) {
        const url = new URL(req.url);
        const headers = new Headers();

        // Set CORS headers
        headers.set('Access-Control-Allow-Origin', '*'); // Allow all origins
        headers.set('Access-Control-Allow-Methods', 'GET, POST'); // Specify allowed methods
        headers.set('Access-Control-Allow-Headers', 'Content-Type'); // Specify allowed headers

        if (url.pathname === '/') {
            const htmlContent = await fs.readFile(path.join(process.cwd(), 'index.html'), 'utf-8');
            return new Response(htmlContent, {
                headers: { ...headers, 'Content-Type': 'text/html' }
            });
        } else if (url.pathname === '/client.js') {
            const jsContent = await fs.readFile(path.join(process.cwd(), 'client.js'), 'utf-8');
            return new Response(jsContent, {
                headers: { ...headers, 'Content-Type': 'application/javascript' }
            });
        }
        return new Response('404 Not Found', { status: 404, headers });
    },
});



console.log(`Bun server running on http://localhost:${PORT}`);
console.log(`WebSocket server running on ws://localhost:${WS_PORT}`)