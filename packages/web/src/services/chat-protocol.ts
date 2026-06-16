/**
 * Chat Protocol — 前后端交互的唯一类型协议
 *
 * 职责：
 * - 定义 SSE 线路事件格式（文档化当前后端实际输出）
 * - 定义前端消息模型（ChatMessage + Block 体系）
 * - 定义流式回调签名
 *
 * 扩展原则：
 * - 新增 Block 类型：定义 interface + 加入 MessageBlock 联合类型
 * - 新增元数据字段：加入 ChatMessageMetadata（支持索引签名任意扩展）
 * - 新增流式事件类型：扩展 StreamEvent.type 联合
 */

import type { ParsedEdit } from './editParser';

// ========== SSE 线路事件（记录当前后端输出格式） ==========

/** SSE data: 行解析后的所有可能形状 */
export type SseWireEvent =
  | { chunk: string }
  | { thinking: string }
  | { tool_start: string }                               // 当前格式："🔍 toolName: label"
  | { tool_end: string }
  | { tool_result: { name: string; content: string } }   // 结构化工具结果
  | { error: string }
  | { done: true; edits?: ParsedEdit[]; toolCalls?: number };

// ========== Block 类型体系（可扩展联合） ==========

/** 所有 Block 的基类 */
export interface BaseBlock {
  id: string;
  type: string;
  timestamp: number;
  completed: boolean;
}

/** 思考块 — AI 推理过程 */
export interface ThinkingBlock extends BaseBlock {
  type: 'thinking';
  content: string;
}

/** 回复块 — Markdown 正文 */
export interface ResponseBlock extends BaseBlock {
  type: 'response';
  content: string;
}

/** 工具调用块 — 内置工具 + MCP 工具 */
export interface ToolCallBlock extends BaseBlock {
  type: 'tool_call';
  toolType: string;
  toolLabel?: string;
  /** 工具分类（未来可按分类差异渲染主题色） */
  toolCategory?: 'file' | 'shell' | 'search' | 'mcp' | 'delegate';
  content: string;
  /** 工具输入参数（未来可用于展示调用详情） */
  params?: Record<string, unknown>;
}

/** 编辑摘要块 — 文件修改记录 */
export interface EditSummaryBlock extends BaseBlock {
  type: 'edit_summary';
  edits: ParsedEdit[];
  content?: string;
}

/** 错误块 — 异常信息 */
export interface ErrorBlock extends BaseBlock {
  type: 'error';
  content: string;
}

// ========== 预留扩展 Block 类型 ==========

/** 预留：技能调用块 */
export interface SkillCallBlock extends BaseBlock {
  type: 'skill_call';
  skillName: string;
  skillArgs?: string;
  content: string;
}

/** 预留：Agent 切换块（多 Agent 场景） */
export interface AgentSwitchBlock extends BaseBlock {
  type: 'agent_switch';
  fromAgent: string;
  toAgent: string;
  reason: string;
}

/** 预留：Token 用量块 */
export interface TokenUsageBlock extends BaseBlock {
  type: 'token_usage';
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  model?: string;
}

/** 所有 Block 联合类型 — 新增 Block 类型只需扩展此联合 */
export type MessageBlock =
  | ThinkingBlock
  | ResponseBlock
  | ToolCallBlock
  | EditSummaryBlock
  | ErrorBlock;
  // 预留（需要时取消注释即可激活）
  // | SkillCallBlock
  // | AgentSwitchBlock
  // | TokenUsageBlock;

// ========== ChatMessage ==========

/** 消息元数据 — 可扩展字段 */
export interface ChatMessageMetadata {
  agentId?: string;
  tokenUsage?: {
    prompt: number;
    completion: number;
    total: number;
  };
  model?: string;
  durationMs?: number;
  turnIndex?: number;
  /** 开放索引签名，允许任意扩展字段 */
  [key: string]: unknown;
}

/** 聊天消息 */
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  /** @deprecated 旧版兼容（无 blocks 的持久化会话），新代码使用 blocks */
  thinking?: string;
  timestamp: number;
  /** 结构化的渲染块（新协议） */
  blocks?: MessageBlock[];
  /** 可扩展元数据 */
  metadata?: ChatMessageMetadata;

  /** @deprecated 使用 blocks 替代 */
  edits?: ParsedEdit[];
  /** @deprecated 使用 blocks 替代 */
  editOperations?: ParsedEdit[];
}

// ========== 流式回调签名 ==========

/** 内容块回调 */
export type ContentChunkCallback = (type: 'thinking' | 'content', text: string) => void;

/** 流式事件 */
export interface StreamEvent {
  type: 'tool_start' | 'tool_end' | 'tool_result' | 'thinking_start' | 'thinking_end';
  message?: string;
  content?: string;
}

/** 流式事件回调 */
export type StreamEventCallback = (event: StreamEvent) => void;

// ========== Agent 配置 ==========

/** Agent 运行配置（发送给后端的请求参数） */
export interface AgentConfig {
  mode: 'build' | 'plan';
  providerId?: string;
  model?: string;
  apiUrl?: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
}

// ========== Agent 上下文 ==========

/** Agent 上下文 — IDE 环境快照 */
export interface AgentContext {
  openFiles: { path: string; content: string }[];
  fileTree: string[];
  cursorPosition?: { file: string; line: number; column: number };
  selection?: { file: string; text: string; startLine: number; endLine: number };
  conversationHistory: { id: string; role: string; content: string; timestamp: number }[];
}
