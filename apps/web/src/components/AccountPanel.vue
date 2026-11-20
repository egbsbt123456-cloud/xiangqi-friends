<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
defineProps<{compact?:boolean}>();
const enabled = ref(false), user = ref<{username:string;nickname:string}|null>(null), mode = ref<'login'|'register'>('login'), opened = ref(false), busy = ref(false), error = ref(''), username = ref(''), password = ref('');
async function refresh(){try { enabled.value = (await (await fetch('/api/auth/status')).json()).enabled; const response = await fetch('/api/auth/me'); user.value=response.ok?(await response.json()).user:null; } catch { error.value='账号服务暂时不可用'; }}
onMounted(()=>{void refresh();window.addEventListener('boardgame:account-changed',refresh);});
onUnmounted(()=>window.removeEventListener('boardgame:account-changed',refresh));
async function submit(action: 'login'|'register'|'logout') {
  busy.value=true; error.value='';
  try { const response = await fetch(`/api/auth/${action}`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(action==='logout' ? {} : {username:username.value,password:password.value}) }); const data=await response.json(); if (!response.ok) throw new Error(data.error || '操作失败'); user.value=data.user ?? null; password.value=''; opened.value=false; window.dispatchEvent(new Event('boardgame:account-changed')); }
  catch (err) { error.value=err instanceof Error ? err.message : '连接失败'; }
  finally { busy.value=false; }
}
</script>
<template>
  <div><template v-if="user"><span>{{ user.nickname }}</span> <button :disabled="busy" @click="submit('logout')">退出</button></template><button v-else-if="enabled" @click="opened=!opened">登录 / 注册</button><span v-else class="guest" title="账号入口暂未开放">{{compact?'游客':'游客浏览 · 账号入口待 HTTPS 开放'}}</span>
    <section v-if="opened" class="account-panel" aria-label="账号入口"><h2>{{ mode==='login' ? '登录' : '注册账号' }}</h2><form @submit.prevent="submit(mode)"><label>用户名<input v-model="username" autocomplete="username" required minlength="3" maxlength="32" pattern="[a-zA-Z0-9_]+"></label><label>密码<input v-model="password" type="password" :autocomplete="mode==='login' ? 'current-password' : 'new-password'" required minlength="8" maxlength="128"></label><p>用户名为 3–32 位字母、数字或下划线；密码至少 8 位。</p><button :disabled="busy">{{ busy ? '正在处理…' : mode==='login' ? '登录' : '注册并登录' }}</button></form><button @click="mode=mode==='login'?'register':'login';error=''">{{ mode==='login' ? '没有账号？去注册' : '已有账号？去登录' }}</button> <button @click="opened=false">关闭</button></section><p v-if="error" role="alert">{{ error }}</p>
  </div>
</template>
<style scoped>
button{border:1px solid #bcc9bd;border-radius:5px;background:#f8faf5;color:#264f40;padding:9px 12px;cursor:pointer}button:disabled{opacity:.5;cursor:wait}.account-panel{position:absolute;z-index:10;right:24px;top:90px;width:min(360px,calc(100vw - 48px));padding:24px;background:white;box-shadow:0 10px 50px #0002;border:1px solid #ddd;border-radius:8px}label{display:block;margin:16px 0}input{display:block;width:100%;padding:10px;margin-top:6px;border:1px solid #bbb;border-radius:4px}p{font-size:12px;line-height:1.6}form>button{width:100%;margin-bottom:16px;background:#264f40;color:white}
</style>
