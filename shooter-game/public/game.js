const socket = io();
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const scoreBoard = document.getElementById('scoreBoard');
const timerElement = document.getElementById('timer');
const loginScreen = document.getElementById('loginScreen');
const gameContainer = document.getElementById('gameContainer');
const gameOverScreen = document.getElementById('gameOverScreen');
const playAgainButton = document.getElementById('playAgainButton');

// Set canvas size
canvas.width = 800;
canvas.height = 600;

// Game state
let targets = [];
let players = new Map();
let gameStarted = false;
let timeRemaining = 60;
let explosions = [];

// Game constants
const TARGET_SIZE = 40;

// Drawing functions for different produce types
const drawFunctions = {
    apple: (ctx, x, y, size, rotation) => {
        ctx.save();
        ctx.translate(x + size/2, y + size/2);
        ctx.rotate(rotation);
        
        ctx.fillStyle = '#ff0000';
        ctx.beginPath();
        ctx.arc(0, 0, size/2, 0, Math.PI * 2);
        ctx.fill();
        
        // Stem
        ctx.fillStyle = '#553300';
        ctx.fillRect(-2, -size/2, 4, 10);
        
        ctx.restore();
    },
    
    orange: (ctx, x, y, size, rotation) => {
        ctx.save();
        ctx.translate(x + size/2, y + size/2);
        ctx.rotate(rotation);
        
        ctx.fillStyle = '#ffa500';
        ctx.beginPath();
        ctx.arc(0, 0, size/2, 0, Math.PI * 2);
        ctx.fill();
        
        // Texture lines
        ctx.strokeStyle = '#ff8c00';
        ctx.beginPath();
        for(let i = 0; i < 3; i++) {
            ctx.moveTo(-size/3, -size/3 + i * 10);
            ctx.lineTo(size/3, -size/3 + i * 10);
        }
        ctx.stroke();
        
        ctx.restore();
    },
    
    banana: (ctx, x, y, size, rotation) => {
        ctx.save();
        ctx.translate(x + size/2, y + size/2);
        ctx.rotate(rotation);
        
        ctx.fillStyle = '#ffff00';
        ctx.beginPath();
        ctx.ellipse(0, 0, size/2, size/4, Math.PI/4, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.restore();
    },
    
    carrot: (ctx, x, y, size, rotation) => {
        ctx.save();
        ctx.translate(x + size/2, y + size/2);
        ctx.rotate(rotation);
        
        ctx.fillStyle = '#ff6b00';
        ctx.beginPath();
        ctx.moveTo(-size/4, -size/2);
        ctx.lineTo(size/4, -size/2);
        ctx.lineTo(0, size/2);
        ctx.closePath();
        ctx.fill();
        
        // Leaves
        ctx.fillStyle = '#00aa00';
        ctx.beginPath();
        ctx.moveTo(-size/4, -size/2);
        ctx.lineTo(-size/2, -size/2 - 10);
        ctx.lineTo(0, -size/2);
        ctx.moveTo(size/4, -size/2);
        ctx.lineTo(size/2, -size/2 - 10);
        ctx.lineTo(0, -size/2);
        ctx.fill();
        
        ctx.restore();
    },
    
    broccoli: (ctx, x, y, size, rotation) => {
        ctx.save();
        ctx.translate(x + size/2, y + size/2);
        ctx.rotate(rotation);
        
        // Stem
        ctx.fillStyle = '#00aa00';
        ctx.fillRect(-size/6, 0, size/3, size/2);
        
        // Florets
        for(let i = 0; i < 3; i++) {
            ctx.beginPath();
            ctx.arc(-size/3 + i * size/3, -size/4, size/4, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.beginPath();
        ctx.arc(0, -size/2, size/4, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.restore();
    },
    
    eggplant: (ctx, x, y, size, rotation) => {
        ctx.save();
        ctx.translate(x + size/2, y + size/2);
        ctx.rotate(rotation);
        
        ctx.fillStyle = '#800080';
        ctx.beginPath();
        ctx.ellipse(0, 0, size/3, size/2, 0, 0, Math.PI * 2);
        ctx.fill();
        
        // Stem
        ctx.fillStyle = '#00aa00';
        ctx.fillRect(-size/6, -size/2, size/3, size/6);
        
        ctx.restore();
    }
};

function drawTarget(target) {
    if (drawFunctions[target.produce.name]) {
        drawFunctions[target.produce.name](ctx, target.x, target.y, TARGET_SIZE, target.rotation);
    }
}

function createExplosion(x, y, color) {
    const particleCount = 20;
    const particles = [];
    
    for (let i = 0; i < particleCount; i++) {
        const angle = (Math.PI * 2 / particleCount) * i;
        const speed = 2 + Math.random() * 2;
        particles.push({
            x: x,
            y: y,
            dx: Math.cos(angle) * speed,
            dy: Math.sin(angle) * speed,
            alpha: 1,
            color: color
        });
    }
    
    explosions.push({
        particles: particles,
        age: 0
    });
}

function updateExplosions() {
    for (let i = explosions.length - 1; i >= 0; i--) {
        const explosion = explosions[i];
        explosion.age++;
        
        explosion.particles.forEach(particle => {
            particle.x += particle.dx;
            particle.y += particle.dy;
            particle.alpha -= 0.02;
        });
        
        if (explosion.age > 50) {
            explosions.splice(i, 1);
        }
    }
}

function drawExplosions() {
    explosions.forEach(explosion => {
        explosion.particles.forEach(particle => {
            if (particle.alpha > 0) {
                ctx.save();
                ctx.globalAlpha = particle.alpha;
                ctx.fillStyle = particle.color;
                ctx.beginPath();
                ctx.arc(particle.x, particle.y, 3, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
            }
        });
    });
}

function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    if (gameStarted) {
        targets.forEach(target => drawTarget(target));
        updateExplosions();
        drawExplosions();
    }
    
    // Continue animation if game is running
    if (gameStarted) {
        requestAnimationFrame(render);
    }
}

function updateScoreBoard() {
    let html = '<h3>Scores:</h3>';
    for (let [name, score] of players) {
        html += `<div>${name}: ${score}</div>`;
    }
    scoreBoard.innerHTML = html;
}

function updateTimer() {
    timerElement.textContent = `Time: ${timeRemaining}`;
}

function showGameOver(players) {
    // Sort players by score to find the winner
    const sortedPlayers = Array.from(players.entries())
        .map(([name, score]) => ({ name, score }))
        .sort((a, b) => b.score - a.score);

    const winner = sortedPlayers[0];
    const gameOverWinner = document.querySelector('#gameOverScreen .winner');
    const gameOverScores = document.querySelector('#gameOverScreen .scores');

    // Display winner
    gameOverWinner.textContent = `Winner: ${winner.name} - ${winner.score} points!`;

    // Display all scores
    gameOverScores.innerHTML = sortedPlayers
        .map((player, index) => 
            `${index + 1}. ${player.name}: ${player.score} points`
        )
        .join('<br>');

    // Show game over screen
    gameOverScreen.style.display = 'flex';
    gameContainer.style.display = 'none';
}

// Add join button event listener
document.getElementById('joinButton').addEventListener('click', () => {
    const playerName = document.getElementById('playerName').value.trim();
    if (playerName) {
        socket.emit('joinGame', playerName);
        loginScreen.style.display = 'none';
        gameContainer.style.display = 'block';
    }
});

// Socket event handlers
socket.on('playerJoined', (data) => {
    data.players.forEach(player => {
        players.set(player.name, player.score);
    });
    targets = data.targets;
    updateScoreBoard();
});

socket.on('gameStart', (data) => {
    gameStarted = true;
    timeRemaining = data.duration;
    render(); // Start rendering loop

    // Start countdown timer
    const timerInterval = setInterval(() => {
        timeRemaining--;
        updateTimer();
        if (timeRemaining <= 0) {
            clearInterval(timerInterval);
        }
    }, 1000);
});

socket.on('targetSpawned', (target) => {
    targets.push(target);
});

socket.on('targetsRemoved', (targetIds) => {
    // Remove old targets from the game
    targets = targets.filter(target => !targetIds.includes(target.id));
});

socket.on('targetPositions', (updatedTargets) => {
    targets = updatedTargets;
});

socket.on('targetHit', (data) => {
    targets = targets.filter(t => t.id !== data.targetId);
    players.set(data.playerName, data.newScore);
    updateScoreBoard();
});

socket.on('updateTimer', (time) => {
    timeRemaining = time;
    updateTimer();
});

socket.on('gameEnd', (data) => {
    gameStarted = false;
    clearInterval(timerInterval);
    showGameOver(players);
});

// Add play again button handler
playAgainButton.addEventListener('click', () => {
    gameOverScreen.style.display = 'none';
    loginScreen.style.display = 'flex';
    players.clear();
    targets = [];
    explosions = [];
    timeRemaining = 60;
    updateScoreBoard();
    updateTimer();
});

// Mouse click handler
canvas.addEventListener('click', (e) => {
    if (!gameStarted) return;
    
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    // Check for target hits
    targets.forEach(target => {
        const dx = x - (target.x + TARGET_SIZE/2);
        const dy = y - (target.y + TARGET_SIZE/2);
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance < TARGET_SIZE/2) {
            socket.emit('shoot', {
                targetId: target.id,
                x: x,
                y: y
            });
        }
    });
});
