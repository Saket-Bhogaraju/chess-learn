// Stockfish loader — works with stockfish-18-asm.js as a Web Worker
window.sfWorker = null;
window.sfReady = false;

window.initStockfish = function() {
  return new Promise((resolve, reject) => {
    try {
      const worker = new Worker('js/stockfish-18-asm.js');

      worker.onmessage = function(e) {
        if (e.data === 'uciok') {
          window.sfWorker = worker;
          window.sfReady = true;
          console.log('Stockfish 18 ready');
          resolve(worker);
        }
      };

      worker.onerror = function(err) {
        console.error('Stockfish worker error:', err);
        reject(err);
      };

      worker.postMessage('uci');
    } catch (e) {
      console.error('Could not start Stockfish worker:', e);
      reject(e);
    }
  });
};
