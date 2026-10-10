/** 路由共享上下文 */
import type { Db } from '../db';

export interface AppContext {
  db: Db;
  /** 当前时间（便于测试注入） */
  now: () => number;
  version: string;
}
