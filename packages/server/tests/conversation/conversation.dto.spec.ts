import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { SendMessageDto, SendMessagePartDto, UpdateMessageDto } from '../../src/adapters/http/conversation/conversation.dto';

describe('conversation dto', () => {
  it('accepts structured message parts with provider and model overrides', () => {
    expect(validateSync(plainToInstance(SendMessageDto, { content: '你好', model: 'gpt-5.4', parts: [{ text: '你好', type: 'text' }], provider: 'openai' }))).toEqual([]);
  });

  it('rejects invalid message parts and oversize updates', () => {
    expect(validateSync(plainToInstance(SendMessageDto, { parts: [{ image: 123, type: 'image' }] })).length).toBeGreaterThan(0);
    expect(validateSync(plainToInstance(UpdateMessageDto, { parts: Array.from({ length: 65 }, () => ({ text: 'x', type: 'text' })) })).length).toBeGreaterThan(0);
  });

  it('requires text content for text parts', () => {
    expect(validateSync(plainToInstance(SendMessagePartDto, { type: 'text' })).length).toBeGreaterThan(0);
  });
});
