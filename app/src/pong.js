// Standalone game handler - works with Azure Functions, AWS Lambda, or any HTTP server

const redis = require('redis');

// Redis client setup
let redisClient = null;
let isRedisConnected = false;
let redisUnavailable = false;
let redisUnavailableMessage = null;

class RedisUnavailableError extends Error {
  constructor(message) {
    super(message || 'Redis connection unavailable');
    this.name = 'RedisUnavailableError';
  }
}

async function getRedisClient() {
  if (redisUnavailable) {
    throw new RedisUnavailableError(redisUnavailableMessage);
  }

  if (!redisClient) {
    const host = process.env.CONNECTION_REDIS_HOST || 'localhost';
    const port = process.env.CONNECTION_REDIS_PORT || '6379';
    const username = process.env.CONNECTION_REDIS_USERNAME || undefined;
    const password = process.env.CONNECTION_REDIS_PASSWORD || undefined;
    const useTls = process.env.CONNECTION_REDIS_TLS === 'true';
    
    const config = {
      socket: {
        host: host,
        port: parseInt(port, 10),
        tls: useTls,
        connectTimeout: 1500
      }
    };
    
    // Add authentication if provided
    if (username) {
      config.username = username;
    }
    if (password) {
      config.password = password;
    }
    
    redisClient = redis.createClient(config);
    
    redisClient.on('error', (err) => {
      console.error('Redis Client Error', err);
      isRedisConnected = false;
      redisUnavailable = true;
      redisUnavailableMessage = err?.message || 'Unknown Redis error';
    });
    
    redisClient.on('connect', () => {
      console.log('Redis connected');
      isRedisConnected = true;
      redisUnavailable = false;
      redisUnavailableMessage = null;
    });
    
    try {
      await redisClient.connect();
    } catch (err) {
      console.error('Redis connection failed', err);
      redisUnavailable = true;
      redisUnavailableMessage = err?.message || 'Unable to connect to Redis';
      redisClient = null;
      throw new RedisUnavailableError(redisUnavailableMessage);
    }
  }
  return redisClient;
}

function redisUnavailableResponse() {
  return {
    statusCode: 503,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ success: false, error: 'Redis connection unavailable', detail: redisUnavailableMessage })
  };
}

async function ensureRedisAvailable() {
  try {
    const client = await getRedisClient();
    return { ok: true, client };
  } catch (err) {
    if (err instanceof RedisUnavailableError) {
      return { ok: false, response: redisUnavailableResponse() };
    }
    throw err;
  }
}

// Session TTL: 5 minutes (300 seconds)
const SESSION_TTL = 300;

// Helper functions for Redis session management
async function getSession(sessionId) {
  const client = await getRedisClient();
  const data = await client.get(`session:${sessionId}`);
  return data ? JSON.parse(data) : null;
}

async function setSession(sessionId, sessionData) {
  const client = await getRedisClient();
  sessionData.lastUpdate = Date.now();
  await client.setEx(`session:${sessionId}`, SESSION_TTL, JSON.stringify(sessionData));
}

async function deleteSession(sessionId) {
  const client = await getRedisClient();
  await client.del(`session:${sessionId}`);
}

function generateSessionId() {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

// Main handler function - platform agnostic
async function handleRequest(method, url, body) {
  const urlObj = new URL(url, 'http://localhost');
  const action = urlObj.searchParams.get('action');

  // Handle GET requests - serve the HTML page
  if (method === 'GET' && !action) {
    const html = getGameHTML();
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'text/html' },
      body: html
    };
  }

  // Handle POST requests - game state management
  if (method === 'POST') {
    try {
      const redisStatus = await ensureRedisAvailable();
      if (!redisStatus.ok) {
        return redisStatus.response;
      }

      const requestBody = typeof body === 'string' ? JSON.parse(body) : body;
      
      switch (action) {
        case 'create':
          return handleCreate();
          
        case 'join':
          return handleJoin(requestBody);
          
        case 'start':
          return handleStart(requestBody);
          
        case 'reset':
          return handleReset(requestBody);
          
        case 'update':
          return handleUpdate(requestBody);
          
        case 'state':
          return handleState(requestBody);
          
        default:
          return {
            statusCode: 400,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ success: false, error: 'Invalid action' })
          };
      }
    } catch (error) {
      if (error instanceof RedisUnavailableError || redisUnavailable) {
        return redisUnavailableResponse();
      }
      console.error('Error:', error);
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: false, error: error.message })
      };
    }
  }

  return {
    statusCode: 405,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ success: false, error: 'Method not allowed' })
  };
}

async function handleCreate() {
  const sessionId = generateSessionId();
  const sessionData = {
    ballX: 400,
    ballY: 300,
    ballVelX: 10,
    ballVelY: 7.5,
    ballSpeedMultiplier: 1.0,
    p1Y: 300,
    p2Y: 300,
    p1Score: 0,
    p2Score: 0,
    gameStarted: false,
    winner: null,
    countdownActive: false,
    countdownValue: 0,
    readyToStart: false,
    lastUpdate: Date.now(),
    p1Connected: true,
    p2Connected: false
  };
  
  await setSession(sessionId, sessionData);
  
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, success: true })
  };
}

async function handleJoin(body) {
  const joinSessionId = body.sessionId;
  const session = await getSession(joinSessionId);
  
  if (session) {
    session.p2Connected = true;
    await setSession(joinSessionId, session);
    
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: true, p2Connected: true })
    };
  }
  return {
    statusCode: 404,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ success: false, error: 'Session not found' })
  };
}

async function handleStart(body) {
  const startSessionId = body.sessionId;
  const session = await getSession(startSessionId);
  
  if (session) {
    session.countdownActive = true;
    session.countdownValue = 3;
    session.countdownStartTime = Date.now();
    await setSession(startSessionId, session);
    
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: true })
    };
  }
  return {
    statusCode: 404,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ success: false, error: 'Session not found' })
  };
}

async function handleReset(body) {
  const resetSessionId = body.sessionId;
  const session = await getSession(resetSessionId);
  
  if (session) {
    session.ballX = 400;
    session.ballY = 300;
    session.ballVelX = 10;
    session.ballVelY = 7.5;
    session.ballSpeedMultiplier = 1.0;
    session.p1Score = 0;
    session.p2Score = 0;
    session.gameStarted = false;
    session.winner = null;
    session.countdownActive = true;
    session.countdownValue = 3;
    session.countdownStartTime = Date.now();
    session.readyToStart = false;
    await setSession(resetSessionId, session);
    
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: true })
    };
  }
  return {
    statusCode: 404,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ success: false, error: 'Session not found' })
  };
}

async function handleUpdate(body) {
  const updateSessionId = body.sessionId;
  const session = await getSession(updateSessionId);
  
  if (session) {
    if (body.player === 1 && body.paddleY !== undefined) {
      session.p1Y = body.paddleY;
    } else if (body.player === 2 && body.paddleY !== undefined) {
      session.p2Y = body.paddleY;
    }
    
    if (body.ballX !== undefined) {
      session.ballX = body.ballX;
      session.ballY = body.ballY;
      session.ballVelX = body.ballVelX;
      session.ballVelY = body.ballVelY;
    }
    
    if (body.ballSpeedMultiplier !== undefined) {
      session.ballSpeedMultiplier = body.ballSpeedMultiplier;
    }
    
    if (body.p1Score !== undefined) {
      session.p1Score = body.p1Score;
    }
    if (body.p2Score !== undefined) {
      session.p2Score = body.p2Score;
    }
    
    if (body.winner !== undefined) {
      session.winner = body.winner;
    }
    
    if (body.countdownActive !== undefined) {
      session.countdownActive = body.countdownActive;
      if (body.countdownActive === false && body.countdownValue === 0) {
        session.readyToStart = true;
      }
    }
    
    if (body.countdownValue !== undefined) {
      session.countdownValue = body.countdownValue;
    }
    
    if (body.gameStarted !== undefined) {
      session.gameStarted = body.gameStarted;
    }
    
    if (body.readyToStart !== undefined) {
      session.readyToStart = body.readyToStart;
    }
    
    await setSession(updateSessionId, session);
    
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: true })
    };
  }
  return {
    statusCode: 404,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ success: false, error: 'Session not found' })
  };
}

async function handleState(body) {
  const stateSessionId = body.sessionId;
  const session = await getSession(stateSessionId);
  
  if (session) {
    // Update countdown based on elapsed time
    if (session.countdownActive && session.countdownStartTime) {
      const elapsed = Date.now() - session.countdownStartTime;
      const secondsElapsed = Math.floor(elapsed / 1000);
      
      let newCountdownValue;
      if (secondsElapsed >= 3) {
        newCountdownValue = 0;
      } else {
        newCountdownValue = 3 - secondsElapsed;
      }
      
      if (newCountdownValue !== session.countdownValue) {
        session.countdownValue = newCountdownValue;
      }
      
      if (newCountdownValue === 0) {
        session.countdownActive = false;
        session.readyToStart = true;
        session.countdownStartTime = null;
      }
      
      // Save updated countdown state
      await setSession(stateSessionId, session);
    }
    
    console.log('[STATE] Session state:', JSON.stringify({
      countdownActive: session.countdownActive,
      countdownValue: session.countdownValue,
      readyToStart: session.readyToStart,
      gameStarted: session.gameStarted,
      ballX: session.ballX,
      ballY: session.ballY,
      ballVelX: session.ballVelX,
      ballVelY: session.ballVelY
    }));
    
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        state: session
      })
    };
  }
  return {
    statusCode: 404,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ success: false, error: 'Session not found' })
  };
}

function getGameHTML() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Serverless Pong</title>
</head>
<body>
    <div id="app">
        <div id="lobby" class="lobby-screen">
            <h1>Serverless Pong</h1>
            <div class="lobby-buttons">
                <button id="openP1Btn" class="pixel-button">Open Player 1</button>
                <button id="openP2Btn" class="pixel-button">Open Player 2</button>
            </div>
        </div>
        <div id="game" class="screen hidden">
            <div id="scores">
                <div id="p1Score" class="score"></div>
                <div id="p2Score" class="score"></div>
            </div>
            <canvas id="gameCanvas"></canvas>
            <button id="startBtn" class="pixel-button game-start-btn hidden">START</button>
            <div id="countdown" class="countdown hidden"></div>
            <div id="winMessage" class="hidden">
                <div id="winText"></div>
                <button id="replayBtn" class="pixel-button hidden">REPLAY</button>
            </div>
        </div>
    </div>
    <script>
// Game constants
const FULL_WIDTH = 800;
const CANVAS_WIDTH = 400;
const CANVAS_HEIGHT = 600;
const PADDLE_WIDTH = 20;
const PADDLE_HEIGHT = 100;
const BALL_SIZE = 16;
const WINNING_SCORE = 3;
const UPDATE_INTERVAL = 50;
const BASE_BALL_SPEED = 10;

// Determine API base path based on environment
const API_BASE = window.location.pathname.includes('/api/') ? '/api/game' : '';

// Game state
let sessionId = null;
let playerNumber = null;
let gameStarted = false;
let p1Y = CANVAS_HEIGHT / 2;
let p2Y = CANVAS_HEIGHT / 2;
let ballX = FULL_WIDTH / 2;
let ballY = CANVAS_HEIGHT / 2;
let ballVelX = BASE_BALL_SPEED;
let ballVelY = BASE_BALL_SPEED * 0.75;
let ballSpeedMultiplier = 1.0;
let p1Score = 0;
let p2Score = 0;
let winner = null;
let mouseY = CANVAS_HEIGHT / 2;
let updateTimer = null;

// DOM elements
const lobby = document.getElementById('lobby');
const game = document.getElementById('game');
const openP1Btn = document.getElementById('openP1Btn');
const openP2Btn = document.getElementById('openP2Btn');
const startBtn = document.getElementById('startBtn');
const canvas = document.getElementById('gameCanvas');
const ctx = canvas ? canvas.getContext('2d') : null;
const p1ScoreDiv = document.getElementById('p1Score');
const p2ScoreDiv = document.getElementById('p2Score');
const winMessage = document.getElementById('winMessage');
const winText = document.getElementById('winText');
const replayBtn = document.getElementById('replayBtn');
const countdown = document.getElementById('countdown');

if (canvas) {
    canvas.width = CANVAS_WIDTH;
    canvas.height = CANVAS_HEIGHT;
}

let isWindowActive = true;
window.addEventListener('focus', () => { isWindowActive = true; });
window.addEventListener('blur', () => { isWindowActive = false; });

document.addEventListener('mousemove', (e) => {
    if (isWindowActive) {
        mouseY = e.clientY;
        mouseY = Math.max(0, Math.min(CANVAS_HEIGHT, mouseY));
        
        if (playerNumber === 1) {
            p1Y = Math.max(PADDLE_HEIGHT / 2, Math.min(CANVAS_HEIGHT - PADDLE_HEIGHT / 2, mouseY));
        } else if (playerNumber === 2) {
            p2Y = Math.max(PADDLE_HEIGHT / 2, Math.min(CANVAS_HEIGHT - PADDLE_HEIGHT / 2, mouseY));
        }
    }
}, { passive: true });

const urlParams = new URLSearchParams(window.location.search);
const sessionParam = urlParams.get('session');
const playerParam = urlParams.get('player');

if (sessionParam && playerParam) {
    sessionId = sessionParam;
    playerNumber = parseInt(playerParam);
    
    if (lobby) lobby.classList.add('hidden');
    if (game) game.classList.remove('hidden');
    
    if (playerNumber === 1) {
        if (startBtn) startBtn.classList.remove('hidden');
        setupPlayerControls();
        startPolling();
    } else if (playerNumber === 2) {
        joinSession();
        setupPlayerControls();
        startPolling();
    }
} else {
    initializeLobby();
}

async function initializeLobby() {
    await createSession();
    setupLobby();
}

async function createSession() {
    try {
        console.log('Creating session...');
        const response = await fetch(API_BASE + '?action=create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({})
        });
        const data = await response.json();
        
        if (data.success) {
            sessionId = data.sessionId;
            console.log('Session created:', sessionId);
        } else {
            console.error('Failed to create session:', data);
        }
    } catch (error) {
        console.error('Error creating session:', error);
    }
}

async function joinSession() {
    try {
        const response = await fetch(API_BASE + '?action=join', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId })
        });
        const data = await response.json();
        
        if (data.success) {
            console.log('Joined session:', sessionId);
        }
    } catch (error) {
        console.error('Error joining session:', error);
    }
}

function setupLobby() {
    console.log('Setting up lobby with sessionId:', sessionId);
    if (openP1Btn) {
        openP1Btn.addEventListener('click', () => {
            console.log('Player 1 button clicked, sessionId:', sessionId);
            const p1Url = window.location.origin + window.location.pathname + '?session=' + sessionId + '&player=1';
            console.log('Opening Player 1 URL:', p1Url);
            window.open(p1Url, 'Player1', 'width=450,height=700,left=100,top=100');
        });
    } else {
        console.error('openP1Btn not found');
    }
    
    if (openP2Btn) {
        openP2Btn.addEventListener('click', () => {
            console.log('Player 2 button clicked, sessionId:', sessionId);
            const p2Url = window.location.origin + window.location.pathname + '?session=' + sessionId + '&player=2';
            console.log('Opening Player 2 URL:', p2Url);
            window.open(p2Url, 'Player2', 'width=450,height=700,left=570,top=100');
        });
    } else {
        console.error('openP2Btn not found');
    }
}

function setupPlayerControls() {
    if (startBtn && playerNumber === 1) {
        startBtn.addEventListener('click', async () => {
            startBtn.classList.add('hidden');
            
            await fetch(API_BASE + '?action=start', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sessionId })
            });
        });
    }
    
    if (replayBtn) {
        replayBtn.addEventListener('click', async () => {
            winMessage.classList.add('hidden');
            replayBtn.classList.add('hidden');
            
            await fetch(API_BASE + '?action=reset', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sessionId })
            });
        });
    }
}

async function gameLoop() {
    if (!gameStarted || winner) return;
    
    if (playerNumber === 1) {
        p1Y = Math.max(PADDLE_HEIGHT / 2, Math.min(CANVAS_HEIGHT - PADDLE_HEIGHT / 2, mouseY));
    } else {
        p2Y = Math.max(PADDLE_HEIGHT / 2, Math.min(CANVAS_HEIGHT - PADDLE_HEIGHT / 2, mouseY));
    }
    
    if (playerNumber === 1) {
        updateBallPhysics();
    }
    
    await sendUpdate();
    render();
}

function updateBallPhysics() {
    ballX += ballVelX;
    ballY += ballVelY;
    
    if (ballY - BALL_SIZE / 2 <= 0 || ballY + BALL_SIZE / 2 >= CANVAS_HEIGHT) {
        ballVelY = -ballVelY;
    }
    
    if (ballX - BALL_SIZE / 2 <= PADDLE_WIDTH) {
        if (ballY >= p1Y - PADDLE_HEIGHT / 2 && ballY <= p1Y + PADDLE_HEIGHT / 2) {
            ballVelX = Math.abs(ballVelX);
            const hitPos = (ballY - p1Y) / (PADDLE_HEIGHT / 2);
            ballVelY += hitPos * 2;
        }
    }
    
    if (ballX + BALL_SIZE / 2 >= FULL_WIDTH - PADDLE_WIDTH) {
        if (ballY >= p2Y - PADDLE_HEIGHT / 2 && ballY <= p2Y + PADDLE_HEIGHT / 2) {
            ballVelX = -Math.abs(ballVelX);
            const hitPos = (ballY - p2Y) / (PADDLE_HEIGHT / 2);
            ballVelY += hitPos * 2;
        }
    }
    
    if (ballX < 0) {
        p2Score++;
        ballSpeedMultiplier *= 1.5;
        resetBall();
    } else if (ballX > FULL_WIDTH) {
        p1Score++;
        ballSpeedMultiplier *= 1.5;
        resetBall();
    }
    
    if (p1Score >= WINNING_SCORE) {
        winner = 1;
        endGame();
    } else if (p2Score >= WINNING_SCORE) {
        winner = 2;
        endGame();
    }
}

function resetBall() {
    ballX = FULL_WIDTH / 2;
    ballY = CANVAS_HEIGHT / 2;
    ballVelX = (Math.random() > 0.5 ? 1 : -1) * BASE_BALL_SPEED * ballSpeedMultiplier;
    ballVelY = (Math.random() - 0.5) * BASE_BALL_SPEED * 1.5 * ballSpeedMultiplier;
}

async function sendUpdate() {
    try {
        const updateData = {
            sessionId,
            player: playerNumber,
            paddleY: playerNumber === 1 ? p1Y : p2Y
        };
        
        if (playerNumber === 1) {
            updateData.ballX = ballX;
            updateData.ballY = ballY;
            updateData.ballVelX = ballVelX;
            updateData.ballVelY = ballVelY;
            updateData.ballSpeedMultiplier = ballSpeedMultiplier;
            updateData.p1Score = p1Score;
            updateData.p2Score = p2Score;
            updateData.winner = winner;
        }
        
        await fetch(API_BASE + '?action=update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updateData)
        });
    } catch (error) {
        console.error('Error sending update:', error);
    }
}

async function startPolling() {
    const paddleUpdateTimer = setInterval(async () => {
        if (!gameStarted && !winner) {
            await sendUpdate();
        }
    }, UPDATE_INTERVAL);
    
    setInterval(async () => {
        try {
            const response = await fetch(API_BASE + '?action=state', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sessionId })
            });
            const data = await response.json();
            
            if (data.success && data.state) {
                if (data.state.countdownActive && data.state.countdownValue > 0 && countdown) {
                    if (countdown.classList.contains('hidden')) {
                        countdown.classList.remove('hidden');
                        countdown.textContent = data.state.countdownValue;
                        winMessage.classList.add('hidden');
                        replayBtn.classList.add('hidden');
                        winner = null;
                        gameStarted = false;
                        p1Score = 0;
                        p2Score = 0;
                        ballSpeedMultiplier = 1.0;
                        if (updateTimer) {
                            clearInterval(updateTimer);
                            updateTimer = null;
                        }
                    } else if (countdown.textContent != data.state.countdownValue) {
                        countdown.textContent = data.state.countdownValue;
                    }
                } else if (!data.state.countdownActive && countdown && !countdown.classList.contains('hidden')) {
                    countdown.classList.add('hidden');
                }
                
                console.log('Poll state - readyToStart:', data.state.readyToStart, 'client gameStarted:', gameStarted, 'server gameStarted:', data.state.gameStarted);
                
                if (data.state.readyToStart && !gameStarted) {
                    console.log('Starting game! readyToStart=', data.state.readyToStart, 'gameStarted=', gameStarted);
                    if (countdown && !countdown.classList.contains('hidden')) {
                        countdown.classList.add('hidden');
                    }
                    
                    gameStarted = true;
                    p1Score = 0;
                    p2Score = 0;
                    ballSpeedMultiplier = 1.0;
                    winner = null;
                    if (updateTimer) {
                        clearInterval(updateTimer);
                    }
                    updateTimer = setInterval(gameLoop, UPDATE_INTERVAL);
                    
                    await fetch(API_BASE + '?action=update', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ sessionId, readyToStart: false, gameStarted: true })
                    });
                } else if (data.state.gameStarted !== gameStarted) {
                    // Only sync gameStarted from server if we didn't just start the game
                    console.log('Syncing gameStarted from server:', data.state.gameStarted);
                    gameStarted = data.state.gameStarted;
                }
                
                if (playerNumber === 2) {
                    ballX = data.state.ballX;
                    ballY = data.state.ballY;
                    ballVelX = data.state.ballVelX;
                    ballVelY = data.state.ballVelY;
                    ballSpeedMultiplier = data.state.ballSpeedMultiplier || 1.0;
                    p1Score = data.state.p1Score;
                    p2Score = data.state.p2Score;
                    p1Y = data.state.p1Y;
                    
                    if (data.state.winner && !winner) {
                        winner = data.state.winner;
                        endGame();
                    }
                } else {
                    p2Y = data.state.p2Y;
                    if (!gameStarted) {
                        ballSpeedMultiplier = data.state.ballSpeedMultiplier || 1.0;
                    }
                }
                
                updateScores();
                render();
            }
        } catch (error) {
            console.error('Error polling state:', error);
        }
    }, UPDATE_INTERVAL);
}

function updateScores() {
    p1ScoreDiv.innerHTML = '';
    p2ScoreDiv.innerHTML = '';
    
    for (let i = 0; i < p1Score; i++) {
        const ball = document.createElement('div');
        ball.className = 'score-ball';
        p1ScoreDiv.appendChild(ball);
    }
    
    for (let i = 0; i < p2Score; i++) {
        const ball = document.createElement('div');
        ball.className = 'score-ball';
        p2ScoreDiv.appendChild(ball);
    }
}

function render() {
    if (!ctx) return;
    
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    ctx.fillStyle = '#0f0';
    
    if (playerNumber === 1) {
        ctx.strokeStyle = '#0f0';
        ctx.lineWidth = 2;
        ctx.setLineDash([10, 10]);
        ctx.beginPath();
        ctx.moveTo(CANVAS_WIDTH - 1, 0);
        ctx.lineTo(CANVAS_WIDTH - 1, CANVAS_HEIGHT);
        ctx.stroke();
        ctx.setLineDash([]);
        
        ctx.fillRect(0, p1Y - PADDLE_HEIGHT / 2, PADDLE_WIDTH, PADDLE_HEIGHT);
        
        if (ballX <= CANVAS_WIDTH) {
            ctx.fillRect(ballX - BALL_SIZE / 2, ballY - BALL_SIZE / 2, BALL_SIZE, BALL_SIZE);
        }
    } else {
        ctx.strokeStyle = '#0f0';
        ctx.lineWidth = 2;
        ctx.setLineDash([10, 10]);
        ctx.beginPath();
        ctx.moveTo(1, 0);
        ctx.lineTo(1, CANVAS_HEIGHT);
        ctx.stroke();
        ctx.setLineDash([]);
        
        ctx.fillRect(CANVAS_WIDTH - PADDLE_WIDTH, p2Y - PADDLE_HEIGHT / 2, PADDLE_WIDTH, PADDLE_HEIGHT);
        
        if (ballX >= CANVAS_WIDTH) {
            const localBallX = ballX - CANVAS_WIDTH;
            ctx.fillRect(localBallX - BALL_SIZE / 2, ballY - BALL_SIZE / 2, BALL_SIZE, BALL_SIZE);
        }
    }
}

function endGame() {
    if (updateTimer) {
        clearInterval(updateTimer);
    }
    if (winText) {
        winText.textContent = 'PLAYER ' + winner + ' WINS!';
    }
    winMessage.classList.remove('hidden');
    
    const isLoser = (playerNumber === 1 && winner === 2) || (playerNumber === 2 && winner === 1);
    if (isLoser && replayBtn) {
        replayBtn.classList.remove('hidden');
    }
}
    </script>
    <style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: 'Courier New', monospace; background: #000; color: #fff; overflow: hidden; display: flex; justify-content: center; align-items: center; height: 100vh; }
body:has(.lobby-screen:not(.hidden)) { background: #fff; color: #000; }
#app { width: 100%; height: 100%; }
.screen { width: 100%; height: 100%; display: flex; flex-direction: column; justify-content: center; align-items: center; }
.hidden { display: none !important; }
.lobby-screen { width: 100%; height: 100%; display: flex; flex-direction: column; justify-content: center; align-items: center; background: #fff; }
.lobby-screen h1 { color: #000; }
.lobby-buttons { display: flex; gap: 2rem; margin-top: 2rem; }
h1 { font-size: 4rem; margin-bottom: 3rem; text-shadow: 4px 4px 0px #333; letter-spacing: 0.5rem; color: #0f0; }
.pixel-button { font-family: 'Courier New', monospace; font-size: 1.5rem; padding: 1rem 2rem; margin: 1rem; background: #0f0; color: #000; border: 4px solid #0a0; cursor: pointer; box-shadow: 4px 4px 0px #0a0; transition: all 0.1s; font-weight: bold; text-transform: uppercase; }
.pixel-button:hover { background: #0ff; border-color: #0aa; box-shadow: 4px 4px 0px #0aa; }
.pixel-button:active { box-shadow: 2px 2px 0px #0a0; }
#game { position: relative; }
#scores { position: absolute; top: 20px; left: 50%; transform: translateX(-50%); display: flex; gap: 4rem; z-index: 10; }
.score { display: flex; gap: 0.5rem; }
.score-ball { width: 16px; height: 16px; background: #0f0; border: 2px solid #0a0; box-shadow: 2px 2px 0px #0a0; }
#gameCanvas { border: 4px solid #0f0; box-shadow: 0 0 20px #0f0; background: #000; }
#winMessage { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); padding: 2rem 4rem; background: rgba(0, 0, 0, 0.9); border: 4px solid #0f0; box-shadow: 0 0 30px #0f0; text-align: center; z-index: 20; display: flex; flex-direction: column; gap: 2rem; }
#winText { font-size: 3rem; }
.game-start-btn { position: absolute; bottom: 2rem; left: 50%; transform: translateX(-50%); z-index: 5; }
#countdown { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); font-size: 10rem; font-weight: bold; color: #0f0; text-shadow: 8px 8px 0px #0a0; z-index: 30; }
    </style>
</body>
</html>`;
}

module.exports = { handleRequest };