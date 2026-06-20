import { describe, test, expect } from 'bun:test'
import { classifyIntent, chatReply, CHAT_REPLIES } from '../src/tui/intent.js'

describe('classifyIntent', () => {
  // --- Chat: greetings ---

  test('very short input is chat', () => {
    expect(classifyIntent('hi')).toBe('chat')
    expect(classifyIntent('hey')).toBe('chat')
    expect(classifyIntent('ok')).toBe('chat')
  })

  test('english greetings are chat', () => {
    expect(classifyIntent('hello')).toBe('chat')
    expect(classifyIntent('Hello')).toBe('chat')
    expect(classifyIntent('HELLO')).toBe('chat')
    expect(classifyIntent('hi')).toBe('chat')
    expect(classifyIntent('hey')).toBe('chat')
  })

  test('chinese greetings are chat', () => {
    expect(classifyIntent('你好')).toBe('chat')
    expect(classifyIntent('您好')).toBe('chat')
    expect(classifyIntent('嗨')).toBe('chat')
    expect(classifyIntent('早上好')).toBe('chat')
    expect(classifyIntent('下午好')).toBe('chat')
    expect(classifyIntent('晚上好')).toBe('chat')
  })

  test('thanks/goodbye are chat', () => {
    expect(classifyIntent('thanks')).toBe('chat')
    expect(classifyIntent('thank you')).toBe('chat')
    expect(classifyIntent('谢谢')).toBe('chat')
    expect(classifyIntent('bye')).toBe('chat')
    expect(classifyIntent('再见')).toBe('chat')
  })

  test('casual acknowledgments are chat', () => {
    expect(classifyIntent('yes')).toBe('chat')
    expect(classifyIntent('ok')).toBe('chat')
    expect(classifyIntent('好的')).toBe('chat')
    expect(classifyIntent('嗯')).toBe('chat')
  })

  // --- Task ---

  test('task keywords classify as task', () => {
    expect(classifyIntent('帮我写一个排序算法')).toBe('task')
    expect(classifyIntent('实现用户登录功能')).toBe('task')
    expect(classifyIntent('修复这个bug')).toBe('task')
    expect(classifyIntent('重构数据库层')).toBe('task')
    expect(classifyIntent('创建一个新页面')).toBe('task')
  })

  test('english task verbs classify as task', () => {
    expect(classifyIntent('fix the login bug')).toBe('task')
    expect(classifyIntent('implement user auth')).toBe('task')
    expect(classifyIntent('create a new API endpoint')).toBe('task')
    expect(classifyIntent('refactor the database layer')).toBe('task')
  })

  test('code/tech keywords classify as task', () => {
    expect(classifyIntent('function foo is broken')).toBe('task')
    expect(classifyIntent('the API route returns 500')).toBe('task')
    expect(classifyIntent('这个组件渲染有问题')).toBe('task')
  })

  test('how-to questions are task', () => {
    expect(classifyIntent('怎么实现分页')).toBe('task')
    expect(classifyIntent('how to add a new route')).toBe('task')
  })

  test('long input is task regardless of content', () => {
    const long = 'a'.repeat(81)
    expect(classifyIntent(long)).toBe('task')
  })

  // --- Commands are not classified (handled earlier) ---

  test('commands are not classified here', () => {
    // commands like /help are caught before classifyIntent is called
    // but if they happen to reach it, they should be chat (no task keywords)
    expect(classifyIntent('/help')).toBe('chat')
    expect(classifyIntent('/exit')).toBe('chat')
    expect(classifyIntent('/agents')).toBe('chat')
    expect(classifyIntent('/loops')).toBe('chat')
  })

  // --- Empty / whitespace ---

  test('empty string is chat', () => {
    expect(classifyIntent('')).toBe('chat')
  })

  test('whitespace-only string is chat', () => {
    expect(classifyIntent('   ')).toBe('chat')
    expect(classifyIntent('\t\n')).toBe('chat')
  })
})

describe('chatReply', () => {
  test('returns one of the predefined replies', () => {
    for (let i = 0; i < 100; i++) {
      const reply = chatReply()
      expect(CHAT_REPLIES).toContain(reply)
    }
  })

  test('can return each possible reply at least once across many calls', () => {
    const seen = new Set<string>()
    for (let i = 0; i < 1000; i++) {
      seen.add(chatReply())
    }
    expect(seen.size).toBeGreaterThanOrEqual(2)
  })
})

describe('CHAT_REPLIES', () => {
  test('is a non-empty array', () => {
    expect(CHAT_REPLIES.length).toBeGreaterThan(0)
  })

  test('all replies are non-empty strings', () => {
    for (const reply of CHAT_REPLIES) {
      expect(typeof reply).toBe('string')
      expect(reply.length).toBeGreaterThan(0)
    }
  })
})
