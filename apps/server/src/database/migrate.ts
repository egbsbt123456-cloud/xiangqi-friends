import { databasePath } from '../config.js';
import { openDatabase, migrate } from './index.js';
const { sqlite } = openDatabase(databasePath);
try { migrate(sqlite); console.log('数据库迁移完成:', databasePath); } finally { sqlite.close(); }
