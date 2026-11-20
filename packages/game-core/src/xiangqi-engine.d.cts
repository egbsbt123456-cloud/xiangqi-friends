import type { XiangqiState, XiangqiMove } from '@board/contracts';
declare const engine: {
 createInitialState(): XiangqiState;
 safeApplyMove(state:XiangqiState,side:'r'|'b',move:XiangqiMove):{ok:true;state:XiangqiState}|{ok:false;code:string};
};
export = engine;
