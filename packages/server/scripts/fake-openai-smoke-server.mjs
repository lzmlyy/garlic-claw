import http from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';

const STREAM_DELAY_MS = 80;

export async function startFakeOpenAiServer() {
  const server = http.createServer(async (request, response) => {
    try {
      const requestUrl = new URL(request.url ?? '/', 'http://127.0.0.1');

      if (request.method === 'GET' && requestUrl.pathname === '/v1/models') {
        writeJson(response, 200, {
          data: [
            { id: 'smoke-model', object: 'model' },
            { id: 'smoke-vision', object: 'model' },
          ],
        });
        return;
      }

      if (
        request.method === 'POST'
        && requestUrl.pathname === '/v1/chat/completions'
      ) {
        const body = await readJsonBody(request);
        if (body.stream === true) {
          await writeStreamResponse(request, response, body);
          return;
        }

        writeJson(response, 200, createChatCompletion(body));
        return;
      }

      writeJson(response, 404, {
        error: `Unsupported smoke route: ${request.method} ${requestUrl.pathname}`,
      });
    } catch (error) {
      writeJson(response, 500, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Failed to start fake OpenAI smoke server');
  }

  return {
    url: `http://127.0.0.1:${address.port}/v1`,
    async close() {
      await new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });
    },
  };
}

function createChatCompletion(body) {
  const text = resolveAssistantText(body);
  const model = body.model ?? 'smoke-model';

  return {
    id: 'chatcmpl-smoke',
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content: text,
        },
        finish_reason: 'stop',
      },
    ],
    usage: {
      prompt_tokens: 12,
      completion_tokens: Math.max(1, text.length),
      total_tokens: 12 + Math.max(1, text.length),
    },
  };
}

async function writeStreamResponse(request, response, body) {
  response.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache',
    connection: 'keep-alive',
  });

  const text = resolveAssistantText(body);
  const model = body.model ?? 'smoke-model';
  const chunks = splitIntoChunks(text, 6);

  for (const chunk of chunks) {
    if (hasClientDisconnected(request, response)) {
      return;
    }

    writeSse(response, {
      id: 'chatcmpl-smoke',
      created: Math.floor(Date.now() / 1000),
      model,
      choices: [
        {
          index: 0,
          delta: {
            role: 'assistant',
            content: chunk,
          },
          finish_reason: null,
        },
      ],
    });
    await delay(STREAM_DELAY_MS);
  }

  if (hasClientDisconnected(request, response)) {
    return;
  }

  writeSse(response, {
    id: 'chatcmpl-smoke',
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [
      {
        index: 0,
        delta: {},
        finish_reason: 'stop',
      },
    ],
    usage: {
      prompt_tokens: 12,
      completion_tokens: Math.max(1, text.length),
      total_tokens: 12 + Math.max(1, text.length),
    },
  });
  response.write('data: [DONE]\n\n');
  response.end();
}

function hasClientDisconnected(request, response) {
  return request.aborted || response.destroyed || response.writableEnded;
}

async function readJsonBody(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }

  if (chunks.length === 0) {
    return {};
  }

  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function resolveAssistantText(body) {
  const messages = Array.isArray(body?.messages) ? body.messages : [];
  if (containsText(messages, '请只回复 OK')) {
    return 'OK';
  }
  if (containsText(messages, '你是一个对话标题生成器')) {
    return '烟测会话标题';
  }
  if (containsImage(messages)) {
    return '这是一张用于后端烟测的图片。';
  }

  const latestUserText = findLatestUserText(messages);
  if (latestUserText.includes('更新后')) {
    return '这是重试后的烟测回复。';
  }

  return latestUserText
    ? `本地 smoke 回复: ${latestUserText}`
    : '本地 smoke 回复。';
}

function containsText(messages, needle) {
  return messages.some((message) => readTextContent(message).includes(needle));
}

function containsImage(messages) {
  return messages.some((message) => {
    if (!Array.isArray(message?.content)) {
      return false;
    }

    return message.content.some((part) =>
      part?.type === 'image_url' || part?.type === 'input_image',
    );
  });
}

function findLatestUserText(messages) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role !== 'user') {
      continue;
    }

    const text = readTextContent(message).trim();
    if (text) {
      return text;
    }
  }

  return '';
}

function readTextContent(message) {
  if (typeof message?.content === 'string') {
    return message.content;
  }
  if (!Array.isArray(message?.content)) {
    return '';
  }

  return message.content
    .map((part) => {
      if (part?.type === 'text' || part?.type === 'input_text') {
        return part.text ?? '';
      }
      return '';
    })
    .join('\n');
}

function splitIntoChunks(text, chunkCount) {
  const normalized = text || ' ';
  const size = Math.max(1, Math.ceil(normalized.length / chunkCount));
  const chunks = [];

  for (let index = 0; index < normalized.length; index += size) {
    chunks.push(normalized.slice(index, index + size));
  }

  return chunks.length > 0 ? chunks : [normalized];
}

function writeJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
  });
  response.end(JSON.stringify(payload));
}

function writeSse(response, payload) {
  response.write(`data: ${JSON.stringify(payload)}\n\n`);
}
