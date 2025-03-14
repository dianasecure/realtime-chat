const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const { Pool } = require("pg");
const cors = require("cors");
const { timeStamp } = require("console");

const pool = new Pool({
    user: "postgres",
    host: "localhost",
    database: "chat_app",
    password: "BC22DRS.ddlk17",
    port: 5432,
});

const app = express();
app.use(express.json());
app.use(cors());

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

let clients = {}; // Store users' WebSocket connections

wss.on("connection", (ws) => {
    let username = null;
    let sessionId = null;

    ws.on("message", async (message) => {
        const data = JSON.parse(message);

        if (data.type === "register") {
            username = data.username;
            sessionId = data.sessionId;
            clients[username] = { ws, sessionId }; // Store user WebSocket

            await pool.query(
                `INSERT INTO users (username) VALUES ($1) ON CONFLICT (username) DO NOTHING`,
                [username]
            );

            await pool.query(
                `INSERT INTO chat_sessions (session_id) VALUES ($1) ON CONFLICT (session_id) DO NOTHING`,
                [sessionId]
            );

            // Fetch chat history for the user
            const result = await pool.query(
                `SELECT sender, text, timestamp FROM messages WHERE session_id = $1 ORDER BY timestamp ASC`,
                [sessionId]
            );

            // Send past messages to the user
            result.rows.forEach(msg => {
                ws.send(`${msg.sender}: ${msg.text}`);
            });

            console.log(`${username} joined session ${sessionId}`);
            return;
        }

        if (data.type === "message") {
            const { sender, text } = data;

            await pool.query(
                `INSERT INTO messages (session_id, sender, text) VALUES ($1, $2, $3)`,
                [sessionId, sender, text]
            );

            // Send message only to users in the session
            Object.entries(clients).forEach(([user, client]) => {
                if (client.ws.readyState === WebSocket.OPEN && client.sessionId === sessionId) {
                    client.ws.send(`${sender}: ${text}` );
                }
            });
        }
    });

    ws.on("close", () => {
        delete clients[username];
        console.log(`${username} disconnected`);
    });
});

// API to get the list of users
app.get("/users", async (req, res) => {
    const result = await pool.query("SELECT username FROM users");
    res.json(result.rows.map(row => row.username));
});

server.listen(3000, () => console.log("Server running on http://localhost:3000"));
