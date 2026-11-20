/* Local background computation only. No network requests or persistent storage. */
'use strict';
importScripts('engine.js', 'ai.js');
self.onmessage = function (event) {
  var job = event.data || {};
  try {
    var result = self.XQAI.bestMove(job.board, job.side, job.depth, {nodeBudget:20000,timeMs:1200});
    self.postMessage({id:job.id,version:job.version,result:result});
  } catch (err) {
    self.postMessage({id:job.id,version:job.version,error:'AI_SEARCH_FAILED'});
  }
};
