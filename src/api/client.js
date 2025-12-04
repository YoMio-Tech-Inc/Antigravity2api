import tokenManager from '../auth/token_manager.js';
import config from '../config/config.js';

// 自定义 API 错误类，携带原始状态码和响应体
export class ApiError extends Error {
  constructor(message, statusCode, responseBody, debugInfo) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.responseBody = responseBody;
    this.debugInfo = debugInfo;
  }
}

// 创建 API 错误的公共函数
function createApiError(response, errorText, token, requestBody, url) {
  const model = requestBody.model || 'unknown';
  const projectId = requestBody.project || token.project_id || 'none';
  const tokenEmail = token.email || (token.refresh_token ? token.refresh_token.slice(0, 10) + '...' : 'unknown');
  const debugInfo = `[URL: ${url}] [Model: ${model}] [Project: ${projectId}] [Account: ${tokenEmail}]`;

  if (response.status === 403) {
    tokenManager.disableCurrentToken(token);
  }

  let responseBody;
  try {
    responseBody = JSON.parse(errorText);
  } catch {
    responseBody = { error: { message: errorText } };
  }

  return new ApiError(
    `API请求失败 (${response.status}): ${debugInfo} ${errorText}`,
    response.status,
    responseBody,
    debugInfo
  );
}

export async function generateAssistantResponse(requestBody, callback, refreshToken = null) {
  // 如果传入了 refreshToken，使用指定账号；否则使用轮询
  const token = refreshToken
    ? await tokenManager.getTokenByRefreshToken(refreshToken)
    : await tokenManager.getToken();

  if (!token) {
    throw new Error(refreshToken
      ? '未找到指定的 refresh_token 对应的账号'
      : '没有可用的token，请运行 npm run login 获取token');
  }

  // 使用账号配置的 project_id（如果有）
  if (token.project_id) {
    requestBody.project = token.project_id;
  }

  const url = config.api.url;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Host': config.api.host,
      'User-Agent': config.api.userAgent,
      'Authorization': `Bearer ${token.access_token}`,
      'Content-Type': 'application/json',
      'Accept-Encoding': 'gzip'
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw createApiError(response, errorText, token, requestBody, url);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let thinkingStarted = false;
  let toolCalls = [];
  let usageMetadata = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value);
    const lines = chunk.split('\n').filter(line => line.startsWith('data: '));

    for (const line of lines) {
      const jsonStr = line.slice(6);
      try {
        const data = JSON.parse(jsonStr);
        const parts = data.response?.candidates?.[0]?.content?.parts;

        // 捕获 usageMetadata
        if (data.response?.usageMetadata) {
          usageMetadata = data.response.usageMetadata;
        }

        if (parts) {
          for (const part of parts) {
            if (part.thought === true) {
              if (!thinkingStarted) {
                callback({ type: 'thinking', content: '<think>\n' });
                thinkingStarted = true;
              }
              callback({ type: 'thinking', content: part.text || '' });
            } else if (part.text !== undefined) {
              if (thinkingStarted) {
                callback({ type: 'thinking', content: '\n</think>\n' });
                thinkingStarted = false;
              }
              let content = part.text || '';
              if (part.thought_signature) {
                content += `\n<!-- thought_signature: ${part.thought_signature} -->`;
              }

              if (part.inlineData) {
                const mimeType = part.inlineData.mimeType;
                const data = part.inlineData.data;
                content += `\n![Generated Image](data:${mimeType};base64,${data})`;
              }

              if (content) {
                callback({ type: 'text', content: content });
              }
              // 同时发送原生 part 数据（用于 Google 原生 API）
              callback({ type: 'native_part', part: part });
            } else if (part.inlineData) {
              // 处理只有 inlineData 没有 text 的情况（如纯图片响应）
              if (thinkingStarted) {
                callback({ type: 'thinking', content: '\n</think>\n' });
                thinkingStarted = false;
              }
              const mimeType = part.inlineData.mimeType;
              const base64Data = part.inlineData.data;
              callback({ type: 'text', content: `![Generated Image](data:${mimeType};base64,${base64Data})` });
              // 发送原生 part 数据（用于 Google 原生 API）
              callback({ type: 'native_part', part: part });
            } else if (part.functionCall) {
              toolCalls.push({
                id: part.functionCall.id,
                type: 'function',
                function: {
                  name: part.functionCall.name,
                  arguments: JSON.stringify(part.functionCall.args)
                }
              });
              // 发送原生 part 数据（用于 Google 原生 API）
              callback({ type: 'native_part', part: part });
            }
          }
        }

        // 当遇到 finishReason 时，发送所有收集的工具调用
        if (data.response?.candidates?.[0]?.finishReason && toolCalls.length > 0) {
          if (thinkingStarted) {
            callback({ type: 'thinking', content: '\n</think>\n' });
            thinkingStarted = false;
          }
          callback({ type: 'tool_calls', tool_calls: toolCalls });
          toolCalls = [];
        }
      } catch (e) {
        // 忽略解析错误
      }
    }
  }

  // 返回 usageMetadata
  return { usageMetadata };
}

// 用于 Google 原生 API 的非流式请求函数
export async function generateRawResponseNonStream(requestBody, refreshToken = null) {
  const token = refreshToken
    ? await tokenManager.getTokenByRefreshToken(refreshToken)
    : await tokenManager.getToken();

  if (!token) {
    throw new Error(refreshToken
      ? '未找到指定的 refresh_token 对应的账号'
      : '没有可用的token，请运行 npm run login 获取token');
  }

  if (token.project_id) {
    requestBody.project = token.project_id;
  }

  const response = await fetch(config.api.nonStreamUrl, {
    method: 'POST',
    headers: {
      'Host': config.api.host,
      'User-Agent': config.api.userAgent,
      'Authorization': `Bearer ${token.access_token}`,
      'Content-Type': 'application/json',
      'Accept-Encoding': 'gzip'
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw createApiError(response, errorText, token, requestBody, config.api.nonStreamUrl);
  }

  const responseText = await response.text();
  try {
    const data = JSON.parse(responseText);
    // 返回 response 字段（与流式接口格式一致）
    return data.response || data;
  } catch (e) {
    throw new Error(`JSON解析失败: ${e.message}. 原始响应: ${responseText.substring(0, 200)}`);
  }
}

// 用于 Google 原生 API 的流式透传函数
export async function generateRawResponse(requestBody, onChunk, refreshToken = null) {
  // 如果传入了 refreshToken，使用指定账号；否则使用轮询
  const token = refreshToken
    ? await tokenManager.getTokenByRefreshToken(refreshToken)
    : await tokenManager.getToken();

  if (!token) {
    throw new Error(refreshToken
      ? '未找到指定的 refresh_token 对应的账号'
      : '没有可用的token，请运行 npm run login 获取token');
  }

  // 使用账号配置的 project_id（如果有）
  if (token.project_id) {
    requestBody.project = token.project_id;
  }

  const response = await fetch(config.api.url, {
    method: 'POST',
    headers: {
      'Host': config.api.host,
      'User-Agent': config.api.userAgent,
      'Authorization': `Bearer ${token.access_token}`,
      'Content-Type': 'application/json',
      'Accept-Encoding': 'gzip'
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw createApiError(response, errorText, token, requestBody, config.api.url);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let lastResponse = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value);
    const lines = chunk.split('\n').filter(line => line.startsWith('data: '));

    for (const line of lines) {
      const jsonStr = line.slice(6);
      try {
        const data = JSON.parse(jsonStr);
        // 直接透传 data.response（去掉外层的 response 包装，符合标准 Google API 格式）
        if (data.response) {
          lastResponse = data.response;
          onChunk(data.response);
        }
      } catch (e) {
        // 忽略解析错误
      }
    }
  }

  return lastResponse;
}

export async function getAvailableModels() {
  const token = await tokenManager.getToken();

  if (!token) {
    throw new Error('没有可用的token，请运行 npm run login 获取token');
  }

  const response = await fetch(config.api.modelsUrl, {
    method: 'POST',
    headers: {
      'Host': config.api.host,
      'User-Agent': config.api.userAgent,
      'Authorization': `Bearer ${token.access_token}`,
      'Content-Type': 'application/json',
      'Accept-Encoding': 'gzip'
    },
    body: JSON.stringify({})
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`获取模型列表失败 (${response.status}): ${errorText}`);
  }

  const responseText = await response.text();
  let data;
  try {
    data = JSON.parse(responseText);
  } catch (e) {
    throw new Error(`JSON解析失败: ${e.message}. 原始响应: ${responseText.substring(0, 200)}`);
  }

  return {
    object: 'list',
    data: Object.keys(data.models).map(id => ({
      id,
      object: 'model',
      created: Math.floor(Date.now() / 1000),
      owned_by: 'google'
    }))
  };
}
