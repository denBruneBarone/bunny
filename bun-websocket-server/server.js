// server.js
import { serve } from 'bun';
import { WebSocketServer } from 'ws';
import path from 'path';
import fs from 'fs/promises';

const PORT = 8000;
const WS_PORT = 4040;

// WebSocket server
const wss = new WebSocketServer({ port: WS_PORT });
const clients = new Set(); // Keep track of connected clients

wss.on('connection', (ws) => {
    console.log('Client connected');
    clients.add(ws); // Add the new client to the set

    ws.on('message', (message) => {
        console.log("Message(audio) received");
    
        // Check the type of the incoming message
        if (Buffer.isBuffer(message)) {
            console.log("Received a Buffer with length:", message.length); // This is the size of the buffer

            const filePath = path.join(__dirname, 'audioFiles', `audio_${Date.now()}.webm`);

            const buffer = message

            fs.writeFile(filePath, buffer, (err) => {
                if (err) {
                    console.error('Error saving audio file:', err);
                } else {
                    console.log('Audio file saved:', filePath);
                }
            });
        } else {
            console.log("Received message:", message); // Log the message if it's a string
        }

        const audioBlob = new Blob([message], { type: 'audio/webm; codecs=opus' }); 
        console.log("audio blob: ")
        console.log(audioBlob)
        // Broadcast the message to other clients
        clients.forEach(client => {
            if (client !== ws && client.readyState === client.OPEN) {
                client.send(message); // Send raw audio binary data
                console.log("Message sent to client.");
            }
        });
    });

    ws.on('close', () => {
        console.log('Client disconnected');
        clients.delete(ws); // Remove client from the set
    });
});


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
console.log(`WebSocket server running on ws://localhost:${WS_PORT}`);
