export interface NotifySoundConfig {
  /** 总开关 */
  enabled: boolean
  /** 当前正在查看的会话「完成」时不响铃（注意类事件不受此限制） */
  quietCurrent: boolean
  /** 忽略全部子代理（subagent）事件 */
  ignoreSubagent: boolean
  /** 完成铃声（会话回合结束 / 后台任务完成） */
  completionSound: string
  /** 正常结束但队列里还有人类消息时的声音（主 agent 专属，默认 ding） */
  queuedSound: string
  /** 用户主动停止（用户取消 / 父代理取消等）声音，默认 none */
  stoppedSound: string
  /** 审批请求声音 */
  approvalSound: string
  /** 用户提问声音 */
  questionSound: string
  /** 计划评审声音 */
  planReviewSound: string
  /** 目标受阻声音 */
  goalBlockedSound: string
  /** 后台任务失败声音 */
  failureSound: string
  /** 完成事件音量 0..1 */
  completionVolume: number
  /** 排队消息音量 0..1 */
  queuedVolume: number
  /** 用户停止音量 0..1 */
  stoppedVolume: number
  /** 审批请求音量 0..1 */
  approvalVolume: number
  /** 用户提问音量 0..1 */
  questionVolume: number
  /** 计划评审音量 0..1 */
  planReviewVolume: number
  /** 目标受阻音量 0..1 */
  goalBlockedVolume: number
  /** 后台任务失败音量 0..1 */
  failureVolume: number
  /** 子代理完成事件声音（默认 none） */
  subagentCompletionSound: string
  /** 子代理用户停止声音（默认 none） */
  subagentStoppedSound: string
  /** 子代理审批请求声音（默认 none） */
  subagentApprovalSound: string
  /** 子代理用户提问声音（默认 none） */
  subagentQuestionSound: string
  /** 子代理计划评审声音（默认 none） */
  subagentPlanReviewSound: string
  /** 子代理目标受阻声音（默认 none） */
  subagentGoalBlockedSound: string
  /** 子代理后台任务失败声音（默认 none） */
  subagentFailureSound: string
  /** 子代理完成事件音量 0..1 */
  subagentCompletionVolume: number
  /** 子代理用户停止音量 0..1 */
  subagentStoppedVolume: number
  /** 子代理审批请求音量 0..1 */
  subagentApprovalVolume: number
  /** 子代理用户提问音量 0..1 */
  subagentQuestionVolume: number
  /** 子代理计划评审音量 0..1 */
  subagentPlanReviewVolume: number
  /** 子代理目标受阻音量 0..1 */
  subagentGoalBlockedVolume: number
  /** 子代理后台任务失败音量 0..1 */
  subagentFailureVolume: number
}
