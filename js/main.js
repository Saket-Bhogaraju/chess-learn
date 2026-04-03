// ============================================================
//  ChessMind — main.js
// ============================================================

// ── State ────────────────────────────────────────────────────
const state = {
  game: null,          // chess.js instance (play mode)
  board: null,         // chessboard.js instance (play mode)
  opGame: null,        // chess.js instance (openings mode)
  opBoard: null,       // chessboard.js instance (openings mode)
  playerColor: 'white',
  stockfishLevel: 5,
  sfWorker: null,
  moveHistory: [],     // { san, fen, color }[]
  groqKey: '',
  gameOver: false,

  // Openings
  openingColor: 'white',
  selectedOpening: null,
  openingMoves: [],    // master move list from Lichess
  opMoveIndex: 0,
  currentVariation: null,
};

// ── Init ─────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  // Always clear any saved key from localStorage for security
  localStorage.removeItem('groqKey');
  document.getElementById('groqKey').value = '';
  state.groqKey = '';

  initPlayBoard();
  initOpeningBoard();
  loadPopularOpenings();
});

// ── Nav ──────────────────────────────────────────────────────
function showMode(mode) {
  document.querySelectorAll('.mode').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('mode-' + mode).classList.add('active');
  event.target.classList.add('active');
}

function saveKey() {
  const key = document.getElementById('groqKey').value.trim();
  state.groqKey = key;
  // Key lives in memory only — never saved to disk
  flash('groqKey', '#4caf7d');
}

function flash(id, color) {
  const el = document.getElementById(id);
  el.style.borderColor = color;
  setTimeout(() => el.style.borderColor = '', 1200);
}

// ── Chess Engine (minimax with piece-square tables) ───────────
// Runs entirely in the browser — no API, no worker, instant response.

const PIECE_VALUE = { p: 10, n: 30, b: 35, r: 50, q: 90, k: 900 };

// Piece-square bonus tables (from white's perspective, rank 1→8)
const PST = {
  p: [
     0,  0,  0,  0,  0,  0,  0,  0,
     5, 10, 10,-20,-20, 10, 10,  5,
     5, -5,-10,  0,  0,-10, -5,  5,
     0,  0,  0, 20, 20,  0,  0,  0,
     5,  5, 10, 25, 25, 10,  5,  5,
    10, 10, 20, 30, 30, 20, 10, 10,
    50, 50, 50, 50, 50, 50, 50, 50,
     0,  0,  0,  0,  0,  0,  0,  0,
  ],
  n: [
    -50,-40,-30,-30,-30,-30,-40,-50,
    -40,-20,  0,  5,  5,  0,-20,-40,
    -30,  5, 10, 15, 15, 10,  5,-30,
    -30,  0, 15, 20, 20, 15,  0,-30,
    -30,  5, 15, 20, 20, 15,  5,-30,
    -30,  0, 10, 15, 15, 10,  0,-30,
    -40,-20,  0,  0,  0,  0,-20,-40,
    -50,-40,-30,-30,-30,-30,-40,-50,
  ],
  b: [
    -20,-10,-10,-10,-10,-10,-10,-20,
    -10,  5,  0,  0,  0,  0,  5,-10,
    -10, 10, 10, 10, 10, 10, 10,-10,
    -10,  0, 10, 10, 10, 10,  0,-10,
    -10,  5,  5, 10, 10,  5,  5,-10,
    -10,  0,  5, 10, 10,  5,  0,-10,
    -10,  0,  0,  0,  0,  0,  0,-10,
    -20,-10,-10,-10,-10,-10,-10,-20,
  ],
  r: [
     0,  0,  0,  5,  5,  0,  0,  0,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
     5, 10, 10, 10, 10, 10, 10,  5,
     0,  0,  0,  0,  0,  0,  0,  0,
  ],
  q: [
    -20,-10,-10, -5, -5,-10,-10,-20,
    -10,  0,  5,  0,  0,  0,  0,-10,
    -10,  5,  5,  5,  5,  5,  0,-10,
      0,  0,  5,  5,  5,  5,  0, -5,
     -5,  0,  5,  5,  5,  5,  0, -5,
    -10,  0,  5,  5,  5,  5,  0,-10,
    -10,  0,  0,  0,  0,  0,  0,-10,
    -20,-10,-10, -5, -5,-10,-10,-20,
  ],
  k: [
     20, 30, 10,  0,  0, 10, 30, 20,
     20, 20,  0,  0,  0,  0, 20, 20,
    -10,-20,-20,-20,-20,-20,-20,-10,
    -20,-30,-30,-40,-40,-30,-30,-20,
    -30,-40,-40,-50,-50,-40,-40,-30,
    -30,-40,-40,-50,-50,-40,-40,-30,
    -30,-40,-40,-50,-50,-40,-40,-30,
    -30,-40,-40,-50,-50,-40,-40,-30,
  ],
};

function squareIndex(sq) {
  const file = sq.charCodeAt(0) - 97; // a=0..h=7
  const rank = parseInt(sq[1]) - 1;   // 1=0..8=7
  return rank * 8 + file;
}

function evaluateBoard(game) {
  const board = game.board();
  let score = 0;
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const piece = board[r][f];
      if (!piece) continue;
      const type = piece.type;
      const isWhite = piece.color === 'w';
      const pstIndex = isWhite ? (7 - r) * 8 + f : r * 8 + f;
      const val = PIECE_VALUE[type] + (PST[type] ? PST[type][pstIndex] / 10 : 0);
      score += isWhite ? val : -val;
    }
  }
  return score;
}

function minimax(game, depth, alpha, beta, maximizing) {
  if (depth === 0 || game.game_over()) return evaluateBoard(game);
  const moves = game.moves();
  if (maximizing) {
    let best = -Infinity;
    for (const m of moves) {
      game.move(m);
      best = Math.max(best, minimax(game, depth - 1, alpha, beta, false));
      game.undo();
      alpha = Math.max(alpha, best);
      if (beta <= alpha) break;
    }
    return best;
  } else {
    let best = Infinity;
    for (const m of moves) {
      game.move(m);
      best = Math.min(best, minimax(game, depth - 1, alpha, beta, true));
      game.undo();
      beta = Math.min(beta, best);
      if (beta <= alpha) break;
    }
    return best;
  }
}

function getStockfishMove(fen, level) {
  return new Promise((resolve) => {
    const tempGame = new Chess(fen);
    const moves = tempGame.moves({ verbose: true });
    if (!moves.length) { resolve(null); return; }

    // depth 1-4 based on level; shuffle for variety at low levels
    const depth = level <= 3 ? 1 : level <= 6 ? 2 : level <= 8 ? 3 : 4;
    const isBlack = tempGame.turn() === 'b';

    // At low levels, sometimes just pick randomly
    const randomChance = (10 - level) * 0.07; // level1=63%, level10=0%
    if (Math.random() < randomChance) {
      const pick = moves[Math.floor(Math.random() * moves.length)];
      resolve(pick.from + pick.to + (pick.promotion || ''));
      return;
    }

    let bestMove = null;
    let bestScore = isBlack ? Infinity : -Infinity;

    for (const m of moves) {
      tempGame.move(m);
      const score = minimax(tempGame, depth - 1, -Infinity, Infinity, !isBlack);
      tempGame.undo();
      if (isBlack ? score < bestScore : score > bestScore) {
        bestScore = score;
        bestMove = m;
      }
    }

    resolve(bestMove ? bestMove.from + bestMove.to + (bestMove.promotion || '') : null);
  });
}

// ── Play Board ────────────────────────────────────────────────
function initPlayBoard() {
  state.game = new Chess();
  state.board = Chessboard('board', {
    draggable: true,
    position: 'start',
    onDragStart: onDragStart,
    onDrop: onDrop,
    onSnapEnd: () => state.board.position(state.game.fen()),
    pieceTheme: 'https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png',
  });
  $(window).resize(() => state.board.resize());
}

function setColor(color) {
  state.playerColor = color;
  document.getElementById('colorWhite').classList.toggle('active', color === 'white');
  document.getElementById('colorBlack').classList.toggle('active', color === 'black');
}

function updateLevel(val) {
  state.stockfishLevel = parseInt(val);
  document.getElementById('levelDisplay').textContent = val;
}

function startGame() {
  state.game = new Chess();
  state.moveHistory = [];
  state.gameOver = false;
  state.board.start();
  state.board.orientation(state.playerColor);
  updateMoveList();
  setStatus('Your turn — play as ' + state.playerColor);
  document.getElementById('aiReview').innerHTML = '<div class="ai-placeholder"><span class="ai-icon">🧠</span><p>Game in progress. AI review will appear after the game.</p></div>';
  document.getElementById('blunderPrompt').classList.add('hidden');

  if (state.playerColor === 'black') {
    setTimeout(makeStockfishMove, 400);
  }
}

function resignGame() {
  if (!state.game || state.game.game_over()) return;
  state.gameOver = true;
  setStatus('You resigned. Requesting AI review…');
  requestAIReview();
}

function onDragStart(source, piece) {
  if (state.gameOver || state.game.game_over()) return false;
  if (state.playerColor === 'white' && piece.startsWith('b')) return false;
  if (state.playerColor === 'black' && piece.startsWith('w')) return false;
  if (state.game.turn() !== state.playerColor[0]) return false;
}

function onDrop(source, target) {
  const move = state.game.move({ from: source, to: target, promotion: 'q' });
  if (!move) return 'snapback';

  state.moveHistory.push({ san: move.san, fen: state.game.fen(), color: move.color });
  updateMoveList();

  if (state.game.game_over()) {
    handleGameOver();
    return;
  }

  setStatus('Stockfish is thinking…');
  setTimeout(makeStockfishMove, 250);
}

async function makeStockfishMove() {
  console.log("[engine] called, turn=", state.game.turn(), "gameOver=", state.gameOver);
  if (state.game.game_over()) { console.log("[engine] game over"); return; }

  const fen = state.game.fen();
  const bestMove = await getStockfishMove(fen, state.stockfishLevel);
  console.log("[engine] bestMove=", bestMove);
  if (!bestMove || bestMove === "(none)") { console.log("[engine] no move"); return; }

  const move = state.game.move({
    from: bestMove.slice(0, 2),
    to: bestMove.slice(2, 4),
    promotion: bestMove[4] || "q",
  });
  console.log("[engine] applied move=", move);
  if (!move) { console.log("[engine] illegal move"); return; }

  state.board.position(state.game.fen());
  state.moveHistory.push({ san: move.san, fen: state.game.fen(), color: move.color });
  updateMoveList();

  if (state.game.game_over()) { handleGameOver(); return; }
  setStatus("Your turn");
}

function handleGameOver() {
  let msg = 'Game over. ';
  if (state.game.in_checkmate()) msg += state.game.turn() === 'w' ? 'Black wins!' : 'White wins!';
  else if (state.game.in_draw()) msg += 'Draw!';
  setStatus(msg + ' Requesting AI review…');
  state.gameOver = true;
  requestAIReview();
}

function updateMoveList() {
  const moves = state.moveHistory;
  if (!moves.length) { document.getElementById('moveList').textContent = '—'; return; }
  let html = '';
  for (let i = 0; i < moves.length; i += 2) {
    const num = Math.floor(i / 2) + 1;
    const w = moves[i] ? moves[i].san : '';
    const b = moves[i + 1] ? moves[i + 1].san : '';
    html += `<span style="color:var(--text-dim)">${num}.</span> ${w} ${b}<br>`;
  }
  const el = document.getElementById('moveList');
  el.innerHTML = html;
  el.scrollTop = el.scrollHeight;
}

function setStatus(msg) {
  document.getElementById('gameStatus').textContent = msg;
}

// ── Groq AI Review ───────────────────────────────────────────
async function requestAIReview() {
  // Read key fresh from input in case user pasted but didn't click Save
  const inputKey = document.getElementById('groqKey').value.trim();
  if (inputKey) state.groqKey = inputKey;

  if (!state.groqKey) {
    document.getElementById('aiReview').innerHTML = `
      <div class="ai-placeholder">
        <span class="ai-icon">🔑</span>
        <p>Paste your Groq API key in the top bar to get AI move analysis.</p>
      </div>`;
    return;
  }

  const moveSummary = state.moveHistory
    .map((m, i) => `${Math.floor(i/2)+1}${m.color==='w'?'.':'...'} ${m.san}`)
    .join(' ');

  if (!moveSummary) {
    document.getElementById('aiReview').innerHTML = '<div class="ai-placeholder"><p>No moves to analyse.</p></div>';
    return;
  }

  const prompt = `You are a chess coach. Analyse this game and give feedback on up to 5 of the most important moves.
Game moves: ${moveSummary}
Player was: ${state.playerColor}

For each notable move respond in this JSON format:
[
  { "moveNum": 5, "san": "Nxe5", "quality": "blunder|mistake|good|excellent", "explanation": "short explanation" }
]
Return ONLY the JSON array, no other text.`;

  document.getElementById('aiReview').innerHTML = '<div class="ai-placeholder"><span class="loading"></span> Analysing your game…</div>';

  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + state.groqKey,
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        max_tokens: 800,
      }),
    });

    console.log('[groq] status:', res.status);
    const data = await res.json();
    console.log('[groq] response:', data);

    if (data.error) {
      document.getElementById('aiReview').innerHTML = `<div class="ai-placeholder"><span class="ai-icon">⚠️</span><p>Groq error: ${data.error.message}</p></div>`;
      return;
    }

    const text = data.choices?.[0]?.message?.content || '[]';
    console.log('[groq] raw text:', text);
    // Robustly extract JSON array from response
    const match = text.match(/\[[\s\S]*\]/);
    const clean = match ? match[0] : '[]';
    let moves = [];
    try { moves = JSON.parse(clean); } catch(pe) { console.error('[groq] parse error:', pe); }
    renderAIReview(moves);
  } catch (e) {
    document.getElementById('aiReview').innerHTML = '<div class="ai-placeholder"><span class="ai-icon">⚠️</span><p>Could not get AI review. Check your Groq API key.</p></div>';
    console.error('[groq] error:', e);
  }
}

function renderAIReview(moves) {
  if (!moves.length) {
    document.getElementById('aiReview').innerHTML = '<div class="ai-placeholder"><p>No significant moves to highlight.</p></div>';
    return;
  }

  let html = '';
  let firstBlunder = null;

  moves.forEach(m => {
    const cls = (m.quality === 'blunder' || m.quality === 'mistake') ? 'blunder' : 'good';
    const icon = m.quality === 'excellent' ? '✨' : m.quality === 'good' ? '✅' : m.quality === 'mistake' ? '⚠️' : '❌';
    html += `<div class="ai-move-entry ${cls}">
      <div class="ai-move-num">Move ${m.moveNum} — ${m.san} ${icon} ${m.quality.toUpperCase()}</div>
      <div class="ai-move-text">${m.explanation}</div>
    </div>`;
    if (m.quality === 'blunder' && !firstBlunder) firstBlunder = m;
  });

  document.getElementById('aiReview').innerHTML = html;

  // Show blunder prompt for first blunder
  if (firstBlunder) {
    document.getElementById('blunderMove').textContent = firstBlunder.moveNum;
    document.getElementById('blunderPrompt').classList.remove('hidden');
    state._blunderContext = firstBlunder;
  }
}

function submitReason() {
  const reason = document.getElementById('blunderReason').value.trim();
  if (!reason) return;
  const b = state._blunderContext;
  const el = document.getElementById('blunderPrompt');
  el.innerHTML = `<div class="ai-move-entry blunder">
    <div class="ai-move-num">Your reasoning on move ${b.moveNum} — ${b.san}</div>
    <div class="ai-move-text">You said: "${reason}"<br><br>
    <strong>Coach:</strong> ${b.explanation}</div>
  </div>`;
}

// ── Openings Board ────────────────────────────────────────────
function initOpeningBoard() {
  state.opGame = new Chess();
  state.opBoard = Chessboard('boardOpening', {
    draggable: false,
    position: 'start',
    pieceTheme: 'https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png',
  });
  $(window).resize(() => state.opBoard.resize());
}

function setOpeningColor(color) {
  state.openingColor = color;
  document.getElementById('opColorWhite').classList.toggle('active', color === 'white');
  document.getElementById('opColorBlack').classList.toggle('active', color === 'black');
}

// ── Opening Data ──────────────────────────────────────────────
const OPENINGS = [
  { name: "Sicilian Defense", moves: "e4 c5", eco: "B20", desc: "The most popular reply to 1.e4. Black fights for the centre asymmetrically, leading to rich, complex positions." },
  { name: "French Defense", moves: "e4 e6", eco: "C00", desc: "Black prepares ...d5 and accepts a cramped but solid position with counterplay on the queenside." },
  { name: "Caro-Kann Defense", moves: "e4 c6", eco: "B10", desc: "A solid reply to 1.e4. Black aims for ...d5 and a sound pawn structure." },
  { name: "King's Indian Defense", moves: "d4 Nf6 c4 g6", eco: "E60", desc: "Black allows White a big centre then attacks it with pieces and pawns. Rich dynamic play." },
  { name: "Queen's Gambit", moves: "d4 d5 c4", eco: "D06", desc: "White offers a pawn to gain central control. One of the oldest and most respected openings." },
  { name: "London System", moves: "d4 d5 Nf3 Nf6 Bf4", eco: "D02", desc: "A solid, easy-to-learn system for White. Great for beginners who want a reliable setup." },
  { name: "Ruy Lopez", moves: "e4 e5 Nf3 Nc6 Bb5", eco: "C60", desc: "One of the oldest and most analysed openings. White pressures Black's e5 pawn indirectly." },
  { name: "Italian Game", moves: "e4 e5 Nf3 Nc6 Bc4", eco: "C50", desc: "White targets the f7 pawn and controls the centre. Popular at all levels." },
  { name: "Pirc Defense", moves: "e4 d6 d4 Nf6", eco: "B07", desc: "Black allows White a strong centre and counterattacks it later. Hypermodern approach." },
  { name: "Dutch Defense", moves: "d4 f5", eco: "A80", desc: "Black fights for e4 immediately. Aggressive but slightly risky." },
  { name: "English Opening", moves: "c4", eco: "A10", desc: "A flexible flank opening. White controls d5 and transposes into many systems." },
  { name: "Nimzo-Indian Defense", moves: "d4 Nf6 c4 e6 Nc3 Bb4", eco: "E20", desc: "Black pins the knight and fights for central control. One of the best defences to 1.d4." },
];

function loadPopularOpenings() {
  renderOpeningList(OPENINGS);
}

function searchOpenings(query) {
  if (!query.trim()) { renderOpeningList(OPENINGS); return; }
  const q = query.toLowerCase();
  renderOpeningList(OPENINGS.filter(o => o.name.toLowerCase().includes(q) || o.eco.toLowerCase().includes(q)));
}

function renderOpeningList(list) {
  const el = document.getElementById('openingList');
  el.innerHTML = list.map((o, i) =>
    `<div class="opening-item" onclick="selectOpening(${OPENINGS.indexOf(o)})">${o.name} <span style="color:var(--text-dim);font-size:0.7rem">${o.eco}</span></div>`
  ).join('');
}

function selectOpening(idx) {
  state.selectedOpening = OPENINGS[idx];
  document.querySelectorAll('.opening-item').forEach((el, i) => {
    el.classList.toggle('selected', OPENINGS.findIndex(o => o === state.selectedOpening) === i);
  });
  document.getElementById('openingName').textContent = state.selectedOpening.name;
  document.getElementById('openingDesc').textContent = state.selectedOpening.desc;
  document.getElementById('openingInfo').classList.remove('hidden');
}

async function startOpeningTrainer() {
  if (!state.selectedOpening) return;

  // Reset everything
  state.opGame = new Chess();
  state.openingMoves = [];
  state.opMoveIndex = 0;
  state.opBoard.orientation(state.openingColor);
  state.opBoard.position('start');

  document.getElementById('openingStatus').textContent = 'Loading opening from Lichess…';
  document.getElementById('variationPanel').innerHTML = '<div class="ai-placeholder"><span class="loading"></span> Fetching variations…</div>';
  document.getElementById('moveExplain').classList.add('hidden');

  // Play the opening moves onto the board first
  const movesArr = state.selectedOpening.moves.split(' ');
  for (const m of movesArr) {
    const result = state.opGame.move(m);
    if (!result) {
      document.getElementById('openingStatus').textContent = 'Error loading opening moves.';
      return;
    }
    state.openingMoves.push(m);
  }
  state.opBoard.position(state.opGame.fen());
  state.opMoveIndex = movesArr.length;

  // Now fetch variations from this position
  await fetchLichessVariations();
}

async function fetchLichessVariations() {
  const fen = state.opGame.fen();
  try {
    // Use lichess opening explorer (no auth needed, works from browser)
    const url = `https://explorer.lichess.ovh/lichess?fen=${encodeURIComponent(fen)}&topGames=0&recentGames=0&moves=10&ratings=2000,2200,2500`;
    const res = await fetch(url, {
      headers: { 'Accept': 'application/json' }
    });

    if (!res.ok) throw new Error('Lichess API returned ' + res.status);

    const data = await res.json();
    const movesFound = data.moves || [];

    document.getElementById('openingStatus').textContent =
      `${state.selectedOpening.name} — move ${state.opMoveIndex}. ${movesFound.length} continuations found.`;

    renderVariations(movesFound);
  } catch (e) {
    document.getElementById('openingStatus').textContent = 'Could not load Lichess data.';
    document.getElementById('variationPanel').innerHTML = '<div class="ai-placeholder"><span class="ai-icon">⚠️</span><p>Could not reach Lichess. Check your connection.</p></div>';
    console.error(e);
  }
}

function renderVariations(moves) {
  if (!moves.length) {
    document.getElementById('variationPanel').innerHTML = '<div class="ai-placeholder"><p>No variations found — you\'ve reached the edge of the database!</p></div>';
    return;
  }

  const total = moves.reduce((s, m) => s + (m.white || 0) + (m.draws || 0) + (m.black || 0), 0) || 1;
  let html = '<div style="font-size:0.7rem;color:var(--text-dim);font-family:DM Mono,monospace;margin-bottom:0.6rem;text-transform:uppercase;letter-spacing:0.08em">Master game continuations</div>';

  moves.slice(0, 8).forEach(m => {
    const games = (m.white || 0) + (m.draws || 0) + (m.black || 0);
    const pct = Math.round(games / total * 100);
    const wPct = games ? Math.round((m.white || 0) / games * 100) : 0;
    html += `<div class="variation-item" onclick="playVariation('${m.san}')">
      <span>${m.san}</span>
      <span class="variation-freq">↑${wPct}% · ${pct}% of games</span>
    </div>`;
  });

  document.getElementById('variationPanel').innerHTML = html;
}

function playVariation(san) {
  const move = state.opGame.move(san);
  if (!move) {
    console.warn('Invalid move:', san);
    return;
  }
  state.opBoard.position(state.opGame.fen());
  state.openingMoves.push(san);
  state.opMoveIndex++;
  document.getElementById('openingStatus').textContent = `Played: ${san} — fetching continuations…`;

  fetchLichessVariations();
  explainMove(san);
}

function nextOpeningMove() {
  document.getElementById('openingStatus').textContent = 'Click any variation on the right to continue.';
}

function prevOpeningMove() {
  if (state.openingMoves.length === 0) return;
  state.opGame.undo();
  state.openingMoves.pop();
  state.opMoveIndex = Math.max(0, state.opMoveIndex - 1);
  state.opBoard.position(state.opGame.fen());
  document.getElementById('openingStatus').textContent = 'Went back one move.';
  document.getElementById('moveExplain').classList.add('hidden');
  fetchLichessVariations();
}

async function explainMove(san) {
  const el = document.getElementById('moveExplain');
  el.classList.remove('hidden');

  if (!state.groqKey) {
    el.innerHTML = `<strong>${san}</strong> — Paste your Groq API key in the top bar to get move explanations.`;
    return;
  }

  el.innerHTML = `<span class="loading"></span> Explaining <strong>${san}</strong>…`;

  const moveContext = state.openingMoves.join(' ');

  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + state.groqKey,
      },
      body: JSON.stringify({
        model: 'llama3-8b-8192',
        messages: [{
          role: 'user',
          content: `In the chess opening after the moves: ${moveContext}
The move ${san} was just played.
In 2-3 short sentences, explain the strategic IDEA behind ${san}. Why do strong players choose this move? What does it accomplish? Be beginner-friendly and concrete.`
        }],
        temperature: 0.4,
        max_tokens: 150,
      }),
    });
    const data = await res.json();
    const explanation = data.choices?.[0]?.message?.content || 'No explanation available.';
    el.innerHTML = `<strong>${san}</strong> — ${explanation}`;
  } catch {
    el.innerHTML = `<strong>${san}</strong> — Could not load explanation.`;
  }
}
