/**
 * dsh-sound — Host 半体
 *
 * 通过导出 Config 声明 Host 配置；Loader 负责发现 schema。
 * 浏览器继续使用 localStorage 保存声音偏好。
 *
 * 命名空间值结构（schemas 已含默认值）：
 * {
 *   enabled: boolean              // 总开关
 *   quietCurrent: boolean         // 当前正在查看的会话完成时不响铃
 *   ignoreSubagent: boolean       // 忽略全部子代理（subagent）事件
 *   completionSound: string       // 完成铃声（回合结束）
 *   queuedSound: string           // 正常结束但队列里还有人类消息（默认 ding，主 agent 专属）
 *   stoppedSound: string          // 用户主动停止（默认 none，可单独配置）
 *   approvalSound / questionSound / planReviewSound /
 *   goalBlockedSound / failureSound: string   // 五类注意事件专属声音
 *   completionVolume / queuedVolume / approvalVolume / ... : number  // 每类事件独立音量 0..1
 *   subagentCompletionSound / ... / subagentFailureSound: string  // 子代理六类事件声音（默认 none）
 *   subagentCompletionVolume / ... / subagentFailureVolume: number // 子代理六类事件独立音量 0..1
 * }
 * 声音值：内置键（ding|chime|bell|complete|success|none）、'local'（本地文件待选）、
 * 'data:…'（内嵌数据 URL）、'audio:<id>'（IndexedDB 音频库引用）。
 */
import type { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import type { NotifySoundConfig } from './protocol.js';
export type { NotifySoundConfig } from './protocol.js';
export declare const name = "dsh-sound";
export declare const inject: string[];
export declare const Config: z<NotifySoundConfig>;
export declare function apply(ctx: Context): void;
//# sourceMappingURL=index.d.ts.map