import {createApp} from 'vue';
import {createRouter,createWebHistory} from 'vue-router';
import App from './App.vue';
import Xiangqi from './pages/XiangqiPlay.vue';
import './style.css';
const router=createRouter({history:createWebHistory(),routes:[{path:'/',component:Xiangqi},{path:'/games/xiangqi',component:Xiangqi},{path:'/:pathMatch(.*)*',redirect:'/'}]});
createApp(App).use(router).mount('#app');
