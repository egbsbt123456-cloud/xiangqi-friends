import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const root=new URL('../public/xiangqi/',import.meta.url);
function setup(mode:string){
 const fixture=readFileSync(new URL('tests/run-tests.js',root),'utf8');
 const classes=fixture.slice(fixture.indexOf('class FakeClassList'),fixture.indexOf('global.window'));
 const packets:unknown[]=[];const handlers:Record<string,Function>={};
 const sandbox:any={console,URLSearchParams,setTimeout:()=>{throw new Error('Local/online must not schedule AI');},clearTimeout:()=>{}};
 sandbox.window=sandbox;sandbox.location={search:`?mode=${mode}`,origin:'https://board.test'};
 sandbox.parent={postMessage:(p:unknown)=>packets.push(p)};sandbox.addEventListener=(name:string,fn:Function)=>{handlers[name]=fn;};
 const context=vm.createContext(sandbox);
 vm.runInContext(classes+`;globalThis.testEls=els;globalThis.document={getElementById:id=>els[id],createElementNS:(ns,tag)=>new FakeSVGEl(tag),createElement:tag=>new FakeEl(tag)};`,context);
 for(const name of ['engine','notation','geom','ai','app'])vm.runInContext(readFileSync(new URL(`js/${name}.js`,root),'utf8'),context);
 const send=(room:any,origin=sandbox.location.origin,source=sandbox.parent)=>handlers.message?.({source,origin,data:{channel:'boardgame:xiangqi:control',room}});
 return {test:sandbox.__XQ_TEST__,els:sandbox.testEls,engine:sandbox.XQ,packets,send};
}
it('local two-player accepts Red and Black with one-ply undo and never starts AI',()=>{
 const {test,els}=setup('local');
 test.onCellClick(3,0);test.onCellClick(4,0);expect(test.getState().turn).toBe('b');
 test.onCellClick(6,0);test.onCellClick(5,0);expect(test.getState().turn).toBe('r');expect(test.getHistory()).toHaveLength(2);
 test.undo();expect(test.getHistory()).toHaveLength(1);expect(test.getState().board[6][0]).toBe('bP');
 els.btnFlip.dispatch('click');test.newGame();expect(test.getHistory()).toHaveLength(0);
});
it('online board waits for the server, isolates parent messages and preserves selection during unchanged polling',()=>{
 const {test,els,engine,send,packets}=setup('online');
 let state=engine.createInitialState();state.version=1;
 const room={code:'AABBCCDDEE',yourSide:'b',status:'playing',state,history:[]};
 test.onCellClick(3,0);test.onCellClick(4,0);expect(test.getHistory()).toHaveLength(0);
 send(room,'https://evil.test');expect(els.statusBar.textContent).toBe('等待房间同步…');
 send(room);expect(els.btnNew.hidden).toBe(true);expect(els.btnUndo.hidden).toBe(true);
 test.onCellClick(3,0);test.onCellClick(4,0);expect(packets).toHaveLength(1);
 state=engine.safeApplyMove(state,'r',{fr:3,fc:0,tr:4,tc:0}).state;
 send({...room,state,history:[{move:{fr:3,fc:0,tr:4,tc:0},notation:'兵九进一',captured:null}]});
 test.onCellClick(6,0);expect(els.hintLayer.children.length).toBeGreaterThan(0);
 send({...room,state,history:[]});expect(els.hintLayer.children.length).toBeGreaterThan(0);
 test.onCellClick(5,0);expect(packets).toHaveLength(2);expect((packets[1] as any).data.expectedVersion).toBe(2);
 expect(test.getState().version).toBe(2); // no optimistic mutation
 test.onCellClick(6,2);test.onCellClick(5,2);expect(packets).toHaveLength(2);
 const next=engine.safeApplyMove(state,'b',{fr:6,fc:0,tr:5,tc:0}).state;send({...room,state:next,history:[]});expect(test.getState().version).toBe(3);
 send({...room,state,history:[]});expect(test.getState().version).toBe(3);
});
