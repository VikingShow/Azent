const TASK_PATTERNS = [
  /请|帮我|需要|我要/,
  /写|创建|实现|修复|重构|删除|修改|添加|更新|升级|迁移|优化/,
  /fix|implement|create|refactor|write|add|update|delete|remove|migrate/,
  /重构|优化|删除|修改|添加|更新|升级|迁移/,
  /function|class|api|route|endpoint|component|module|package/,
  /代码|文件|功能|特性|模块|页面|组件/,
  /bug|error|issue|问题|故障/,
  /怎么|如何|怎样|what.*do\b|how.*to\b/,
]

const CHAT_PATTERNS = [
  /^.{0,4}$/,
  /^(hello|hi|hey|hiya|sup|yo)\b[\s!.]*$/i,
  /^(你好|您好|嗨|嘿)[\s!.]*$/,
  /^(早上好|下午好|晚上好|晚安)$/,
  /你好[吗!.]*$/, /您好[吗!.]*$/,
  /^how are you/i, /^how('s| is) it going/i,
  /^what('s| is) up/i, /^(what's|whats|wassup|sup)$/i,
  /^(good\s)?(morning|afternoon|evening)/i,
  /^bye\b/i, /^goodbye\b/i, /^cya\b/i, /^再见$/,
  /^thanks?\b/i, /^thank you\b/i, /^谢谢$/i,
  /^nice\s*(to\s*meet\s*you|one)/i,
  /^who are you/i, /^你是谁/i, /^你能做什么/i,
  /^(可以|能)介绍.*自己/i,
  /^(yes|no|ok|okay|好的|嗯|行|可以|好的吧|没问题)$/i,
  /^(哈哈|haha|lol|lmao)$/i,
]

export function classifyIntent(text: string): 'task' | 'chat' {
  const t = text.trim()
  if (t.length > 80) return 'task'
  if (CHAT_PATTERNS.some(p => p.test(t))) return 'chat'
  if (TASK_PATTERNS.some(p => p.test(t))) return 'task'
  return 'chat'
}

export const CHAT_REPLIES = [
  'Hello! How can I help you today?',
  'Hi there! What do you need help with?',
  'Hey! Ready to build something?',
  '你好！有什么我可以帮你的吗？',
  'Hello! Tell me what you want me to do.',
  'Hi! I can write code, review changes, debug issues, and more.',
]

export function chatReply(): string {
  return CHAT_REPLIES[Math.floor(Math.random() * CHAT_REPLIES.length)]
}
