const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');

app.use(express.static('public'));

// Game state
const rooms = new Map();
const GAME_DURATION = 60; // seconds
const MIN_PLAYERS = 2;
const MAX_PLAYERS = 4;
const TARGET_SIZE = 40;
const TARGET_SPEED = 3;
const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 600;

// Produce types for targets
const produceTypes = [
    { name: 'apple', color: '#ff0000' },
    { name: 'orange', color: '#ffa500' },
    { name: 'banana', color: '#ffff00' },
    { name: 'strawberry', color: '#ff4d4d' },
    { name: 'blueberry', color: '#4169e1' },
    { name: 'watermelon', color: '#ff6b6b' },
    { name: 'orange', color: '#ffa500' },
    { name: 'banana', color: '#ffff00' },
    { name: 'carrot', color: '#ff6b00' },
    { name: 'broccoli', color: '#00aa00' },
    { name: 'eggplant', color: '#800080' }
];

class Target {
    constructor() {
        this.x = Math.random() * (CANVAS_WIDTH - TARGET_SIZE);
        this.y = Math.random() * (CANVAS_HEIGHT - TARGET_SIZE);
        this.dx = (Math.random() - 0.5) * TARGET_SPEED;
        this.dy = (Math.random() - 0.5) * TARGET_SPEED;
        this.id = Date.now() + Math.random();
        this.produce = produceTypes[Math.floor(Math.random() * produceTypes.length)];
        this.rotation = 0;
        this.rotationSpeed = (Math.random() - 0.5) * 0.1;
    }

    update() {
        this.x += this.dx;
        this.y += this.dy;
        this.rotation += this.rotationSpeed;

        // Bounce off walls
        if (this.x <= 0 || this.x >= CANVAS_WIDTH - TARGET_SIZE) this.dx *= -1;
        if (this.y <= 0 || this.y >= CANVAS_HEIGHT - TARGET_SIZE) this.dy *= -1;

        return this;
    }
}

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('joinGame', (playerName) => {
        let room = findAvailableRoom();
        socket.join(room);
        
        if (!rooms.has(room)) {
            rooms.set(room, {
                players: new Map(),
                targets: [],
                gameStarted: false,
                gameInterval: null,
                targetInterval: null
            });
        }
        
        rooms.get(room).players.set(socket.id, {
            name: playerName,
            score: 0
        });

        io.to(room).emit('playerJoined', {
            players: Array.from(rooms.get(room).players.values()),
            targets: rooms.get(room).targets
        });

        checkGameStart(room);
    });

    socket.on('shoot', (data) => {
        const room = Array.from(socket.rooms)[1];
        if (!room || !rooms.has(room)) return;
        
        const gameState = rooms.get(room);
        const player = gameState.players.get(socket.id);
        const target = gameState.targets.find(t => t.id === data.targetId);
        
        if (target && player) {
            // Check if the click is within the target bounds
            const dx = data.x - (target.x + TARGET_SIZE/2);
            const dy = data.y - (target.y + TARGET_SIZE/2);
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance < TARGET_SIZE/2) {
                // Remove the target
                gameState.targets = gameState.targets.filter(t => t.id !== target.id);
                player.score += 10;
                
                // Notify all clients about the target removal and score update
                io.to(room).emit('targetDestroyed', {
                    targetId: target.id,
                    players: Array.from(gameState.players.values())
                });
            }
        }
    });

    socket.on('disconnect', () => {
        const room = Array.from(socket.rooms)[1];
        if (room && rooms.has(room)) {
            const gameState = rooms.get(room);
            gameState.players.delete(socket.id);
            
            if (gameState.players.size === 0) {
                if (gameState.gameInterval) clearInterval(gameState.gameInterval);
                if (gameState.targetInterval) clearInterval(gameState.targetInterval);
                rooms.delete(room);
            } else {
                io.to(room).emit('playerLeft', {
                    players: Array.from(gameState.players.values())
                });
            }
        }
    });
});

function findAvailableRoom() {
    for (const [room, state] of rooms) {
        if (state.players.size < MAX_PLAYERS && !state.gameStarted) {
            return room;
        }
    }
    return 'room-' + Date.now();
}

function checkGameStart(room) {
    const gameState = rooms.get(room);
    if (gameState.players.size >= MIN_PLAYERS && !gameState.gameStarted) {
        gameState.gameStarted = true;
        io.to(room).emit('gameStart', { 
            duration: GAME_DURATION,
            produceTypes: produceTypes
        });

        // Spawn targets continuously
        gameState.targetInterval = setInterval(() => {
            // Always spawn a new target
            const newTarget = new Target();
            gameState.targets.push(newTarget);
            io.to(room).emit('targetSpawned', newTarget);
            
            // Clean up targets that are too old (optional, to prevent memory issues)
            if (gameState.targets.length > 50) {
                const oldTargets = gameState.targets.splice(0, 10);
                io.to(room).emit('targetsRemoved', oldTargets.map(t => t.id));
            }
        }, 500); // Spawn every 0.5 seconds

        // Update target positions
        gameState.gameInterval = setInterval(() => {
            gameState.targets.forEach(target => target.update());
            io.to(room).emit('targetPositions', gameState.targets);
        }, 1000 / 60); // 60 FPS updates

        // End game after duration
        setTimeout(() => {
            if (rooms.has(room)) {
                if (gameState.gameInterval) clearInterval(gameState.gameInterval);
                if (gameState.targetInterval) clearInterval(gameState.targetInterval);

                const finalScores = Array.from(gameState.players.entries()).map(([id, player]) => ({
                    name: player.name,
                    score: player.score
                }));
                io.to(room).emit('gameEnd', { scores: finalScores });
                rooms.delete(room);
            }
        }, GAME_DURATION * 1000);
    }
}

const PORT = 3000;
http.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
