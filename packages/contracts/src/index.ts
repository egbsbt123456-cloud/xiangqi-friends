export type XiangqiSide='r'|'b';
export interface XiangqiMove {fr:number;fc:number;tr:number;tc:number}
export interface XiangqiState {board:(string|null)[][];turn:XiangqiSide;over:boolean;winner:XiangqiSide|null;reason:string|null;version:number;lastMove:XiangqiMove|null}
export interface XiangqiHistory {move:XiangqiMove;captured:string|null;mover:string;notation:string;turnBefore:XiangqiSide}
export interface XiangqiRoomView {code:string;status:'waiting'|'playing'|'finished'|'cancelled';yourSide:XiangqiSide;redName:string;blackName:string|null;state:XiangqiState;history:XiangqiHistory[];updatedAt:number}
