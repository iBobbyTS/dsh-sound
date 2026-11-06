import z from "@deepseek-ai/schemastery";
// src/index.ts
const name = "dsh-sound";
const inject = [];
const Config = z.object({
	enabled: z.boolean().default(true),
	quietCurrent: z.boolean().default(false),
	ignoreSubagent: z.boolean().default(false),
	completionSound: z.string().default("chime"),
	queuedSound: z.string().default("ding"),
	stoppedSound: z.string().default("none"),
	approvalSound: z.string().default("ding"),
	questionSound: z.string().default("ding"),
	planReviewSound: z.string().default("ding"),
	goalBlockedSound: z.string().default("ding"),
	failureSound: z.string().default("bell"),
	completionVolume: z.number().min(0).max(1).default(1),
	queuedVolume: z.number().min(0).max(1).default(1),
	stoppedVolume: z.number().min(0).max(1).default(1),
	approvalVolume: z.number().min(0).max(1).default(1),
	questionVolume: z.number().min(0).max(1).default(1),
	planReviewVolume: z.number().min(0).max(1).default(1),
	goalBlockedVolume: z.number().min(0).max(1).default(1),
	failureVolume: z.number().min(0).max(1).default(1),
	subagentCompletionSound: z.string().default("none"),
	subagentStoppedSound: z.string().default("none"),
	subagentApprovalSound: z.string().default("ding"),
	subagentQuestionSound: z.string().default("ding"),
	subagentPlanReviewSound: z.string().default("ding"),
	subagentGoalBlockedSound: z.string().default("bell"),
	subagentFailureSound: z.string().default("bell"),
	subagentCompletionVolume: z.number().min(0).max(1).default(1),
	subagentStoppedVolume: z.number().min(0).max(1).default(1),
	subagentApprovalVolume: z.number().min(0).max(1).default(1),
	subagentQuestionVolume: z.number().min(0).max(1).default(1),
	subagentPlanReviewVolume: z.number().min(0).max(1).default(1),
	subagentGoalBlockedVolume: z.number().min(0).max(1).default(1),
	subagentFailureVolume: z.number().min(0).max(1).default(1)
});
function apply() {}
export { Config, apply, inject, name };

//# sourceMappingURL=index.js.map