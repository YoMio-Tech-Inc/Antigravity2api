import fs from 'fs/promises';
import AdmZip from 'adm-zip';
import path from 'path';
import { spawn } from 'child_process';
import logger from '../utils/logger.js';

// ============ Uploader 配置 ============
const UPLOADER_CONFIG = {
  NEW_API_PASSWORD: "gHAVUMjhlnLPKt8Asz60SxV3oW2T9kU=",
  NEW_API_USER: "1",
  BASE_URL: "http://170.106.99.24:17154",
  API_ENDPOINT: "http://34.105.1.43:17151/api/channel/",
  PRIORITY: 8,
  TAG: "Antigravity",
  MODELS: [
    "gemini-3-flash",
    "claude-opus-4-5-20251101-thinking",
    "gemini-flash-latest",
    "gemini-flash-lite-latest",
    "claude-sonnet-4-5-20250929-thinking",
    "claude-sonnet-4-5-20250929",
    "gemini-3-pro",
  ],
  MODEL_MAPPING: {
    "gemini-3-pro": "gemini-3-pro-high",
    "claude-sonnet-4-5-20250929": "claude-sonnet-4-5",
    "claude-sonnet-4-5-20250929-thinking": "claude-sonnet-4-5-thinking",
    "claude-opus-4-5-20251101-thinking": "claude-opus-4-5-thinking",
    "gemini-flash-lite-latest": "gemini-2.5-flash-lite",
    "gemini-flash-latest": "gemini-2.5-flash",
  }
};

// 构建上传 payload
function buildUploaderPayload(projectId, refreshToken) {
  return {
    mode: "single",
    fan_out_by_model: true,
    channel: {
      type: 24,
      max_input_tokens: 0,
      other: "",
      models: UPLOADER_CONFIG.MODELS.join(","),
      auto_ban: 1,
      groups: ["default"],
      priority: UPLOADER_CONFIG.PRIORITY,
      weight: 0,
      multi_key_mode: "random",
      settings: JSON.stringify({}),
      name: projectId,
      key: refreshToken,
      base_url: UPLOADER_CONFIG.BASE_URL,
      test_model: "",
      model_mapping: JSON.stringify(UPLOADER_CONFIG.MODEL_MAPPING),
      tag: UPLOADER_CONFIG.TAG,
      status_code_mapping: "",
      setting: JSON.stringify({
        force_format: false,
        thinking_to_content: false,
        proxy: "",
        pass_through_body_enabled: false,
        system_prompt: "",
        system_prompt_override: false,
        auto_disable_webhook_url: "",
      }),
      group: "default",
    },
  };
}

// 上传单个 credential 到 New API
async function uploadCredential(projectId, refreshToken) {
  const payload = buildUploaderPayload(projectId, refreshToken);

  const response = await fetch(UPLOADER_CONFIG.API_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${UPLOADER_CONFIG.NEW_API_PASSWORD}`,
      'New-Api-User': UPLOADER_CONFIG.NEW_API_USER,
    },
    body: JSON.stringify(payload),
  });

  const text = await response.text();
  return { status: response.status, response: text, projectId };
}

const ACCOUNTS_FILE = path.join(process.cwd(), 'data', 'accounts.json');

// 读取所有账号
export async function loadAccounts() {
  try {
    const data = await fs.readFile(ACCOUNTS_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

// 保存账号
async function saveAccounts(accounts) {
  const dir = path.dirname(ACCOUNTS_FILE);
  try {
    await fs.access(dir);
  } catch {
    await fs.mkdir(dir, { recursive: true });
  }
  await fs.writeFile(ACCOUNTS_FILE, JSON.stringify(accounts, null, 2), 'utf-8');
}

// 删除账号
export async function deleteAccount(index) {
  const accounts = await loadAccounts();
  if (index < 0 || index >= accounts.length) {
    throw new Error('无效的账号索引');
  }
  accounts.splice(index, 1);
  await saveAccounts(accounts);
  logger.info(`账号 ${index} 已删除`);
  return true;
}

// 启用/禁用账号
export async function toggleAccount(index, enable) {
  const accounts = await loadAccounts();
  if (index < 0 || index >= accounts.length) {
    throw new Error('无效的账号索引');
  }
  accounts[index].enable = enable;
  await saveAccounts(accounts);
  logger.info(`账号 ${index} 已${enable ? '启用' : '禁用'}`);
  return true;
}

// 触发登录流程
export async function triggerLogin() {
  return new Promise((resolve, reject) => {
    logger.info('启动登录流程...');

    const loginScript = path.join(process.cwd(), 'scripts', 'oauth-server.js');
    const child = spawn('node', [loginScript], {
      stdio: 'pipe',
      shell: true
    });

    let authUrl = '';
    let output = '';

    child.stdout.on('data', (data) => {
      const text = data.toString();
      output += text;

      // 提取授权 URL
      const urlMatch = text.match(/(https:\/\/accounts\.google\.com\/o\/oauth2\/v2\/auth\?[^\s]+)/);
      if (urlMatch) {
        authUrl = urlMatch[1];
      }

      logger.info(text.trim());
    });

    child.stderr.on('data', (data) => {
      logger.error(data.toString().trim());
    });

    child.on('close', (code) => {
      if (code === 0) {
        logger.info('登录流程完成');
        resolve({ success: true, authUrl, message: '登录成功' });
      } else {
        reject(new Error('登录流程失败'));
      }
    });

    // 5 秒后返回授权 URL，不等待完成
    setTimeout(() => {
      if (authUrl) {
        resolve({ success: true, authUrl, message: '请在浏览器中完成授权' });
      }
    }, 5000);

    child.on('error', (error) => {
      reject(error);
    });
  });
}

// 获取账号统计信息
export async function getAccountStats() {
  const accounts = await loadAccounts();
  return {
    total: accounts.length,
    enabled: accounts.filter(a => a.enable !== false).length,
    disabled: accounts.filter(a => a.enable === false).length
  };
}

// 从回调链接手动添加 Token
import https from 'https';

const CLIENT_ID = '1071006060591-tmhssin2h21lcre235vtolojh4g403ep.apps.googleusercontent.com';
const CLIENT_SECRET = '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';

// 获取 Google 账号信息
export async function getAccountName(accessToken) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'www.googleapis.com',
      path: '/oauth2/v2/userinfo',
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          const data = JSON.parse(body);
          resolve({
            email: data.email,
            name: data.name || data.email
          });
        } else {
          resolve({ email: 'Unknown', name: 'Unknown' });
        }
      });
    });

    req.on('error', () => resolve({ email: 'Unknown', name: 'Unknown' }));
    req.end();
  });
}

export async function addTokenFromCallback(callbackUrl) {
  // 解析回调链接
  const url = new URL(callbackUrl);
  const code = url.searchParams.get('code');
  const port = url.port || '80';

  if (!code) {
    throw new Error('回调链接中没有找到授权码 (code)');
  }

  logger.info(`正在使用授权码换取 Token...`);

  // 使用授权码换取 Token
  const tokenData = await exchangeCodeForToken(code, port, url.origin);

  // 保存账号
  const account = {
    access_token: tokenData.access_token,
    refresh_token: tokenData.refresh_token,
    expires_in: tokenData.expires_in,
    timestamp: Date.now(),
    enable: true
  };

  const accounts = await loadAccounts();
  accounts.push(account);
  await saveAccounts(accounts);

  logger.info('Token 已成功保存');
  return { success: true, message: 'Token 已成功添加' };
}

function exchangeCodeForToken(code, port, origin) {
  return new Promise((resolve, reject) => {
    const redirectUri = `${origin}/oauth-callback`;

    const postData = new URLSearchParams({
      code: code,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code'
    }).toString();

    const options = {
      hostname: 'oauth2.googleapis.com',
      path: '/token',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          resolve(JSON.parse(body));
        } else {
          logger.error(`Token 交换失败: ${body}`);
          reject(new Error(`Token 交换失败: ${res.statusCode} - ${body}`));
        }
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

// 批量添加 Refresh Token（格式：refresh_token----project_id）
export async function batchAddRefreshTokens(text) {
  const lines = text.split('\n').filter(line => line.trim());
  const accounts = await loadAccounts();
  let addedCount = 0;
  let skippedCount = 0;
  const newCredentials = []; // 保存新增的凭证用于上传

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const parts = trimmed.split('----');
    if (parts.length !== 2) {
      logger.warn(`跳过无效行: ${trimmed}`);
      skippedCount++;
      continue;
    }

    const [refresh_token, project_id] = parts;

    // 检查是否已存在相同的 refresh_token
    const exists = accounts.some(acc => acc.refresh_token === refresh_token);
    if (exists) {
      logger.info(`跳过重复的 refresh_token: ${refresh_token.substring(0, 20)}...`);
      skippedCount++;
      continue;
    }

    const trimmedRefreshToken = refresh_token.trim();
    const trimmedProjectId = project_id.trim();

    accounts.push({
      refresh_token: trimmedRefreshToken,
      project_id: trimmedProjectId,
      timestamp: Date.now(),
      enable: true
    });

    // 保存用于上传 (project_id, refresh_token)
    newCredentials.push({ projectId: trimmedProjectId, refreshToken: trimmedRefreshToken });
    addedCount++;
  }

  await saveAccounts(accounts);
  logger.info(`批量添加完成: 成功 ${addedCount} 个, 跳过 ${skippedCount} 个`);

  // 上传新增的凭证到 New API
  let uploadedCount = 0;
  let uploadFailedCount = 0;

  if (newCredentials.length > 0) {
    logger.info(`开始上传 ${newCredentials.length} 个凭证到 New API...`);

    for (const { projectId, refreshToken } of newCredentials) {
      try {
        const result = await uploadCredential(projectId, refreshToken);
        if (result.status === 200 || result.status === 201) {
          logger.info(`上传成功: ${projectId}`);
          uploadedCount++;
        } else {
          logger.warn(`上传失败: ${projectId}, 状态码: ${result.status}, 响应: ${result.response}`);
          uploadFailedCount++;
        }
      } catch (error) {
        logger.error(`上传异常: ${projectId}, 错误: ${error.message}`);
        uploadFailedCount++;
      }
    }

    logger.info(`上传完成: 成功 ${uploadedCount} 个, 失败 ${uploadFailedCount} 个`);
  }

  return {
    success: true,
    added: addedCount,
    skipped: skippedCount,
    uploaded: uploadedCount,
    uploadFailed: uploadFailedCount,
    message: `成功添加 ${addedCount} 个账号${skippedCount > 0 ? `，跳过 ${skippedCount} 个` : ''}${uploadedCount > 0 ? `，已上传 ${uploadedCount} 个` : ''}${uploadFailedCount > 0 ? `，上传失败 ${uploadFailedCount} 个` : ''}`
  };
}

// 批量导入 Token
export async function importTokens(filePath) {
  try {
    logger.info('开始导入 Token...');

    // 检查是否是 ZIP 文件
    if (filePath.endsWith('.zip') || true) {
      const zip = new AdmZip(filePath);
      const zipEntries = zip.getEntries();

      // 查找 tokens.json
      const tokensEntry = zipEntries.find(entry => entry.entryName === 'tokens.json');
      if (!tokensEntry) {
        throw new Error('ZIP 文件中没有找到 tokens.json');
      }

      const tokensContent = tokensEntry.getData().toString('utf8');
      const importedTokens = JSON.parse(tokensContent);

      // 验证数据格式
      if (!Array.isArray(importedTokens)) {
        throw new Error('tokens.json 格式错误：应该是一个数组');
      }

      // 加载现有账号
      const accounts = await loadAccounts();

      // 添加新账号
      let addedCount = 0;
      for (const token of importedTokens) {
        // 检查是否已存在
        const exists = accounts.some(acc => acc.access_token === token.access_token);
        if (!exists) {
          accounts.push({
            access_token: token.access_token,
            refresh_token: token.refresh_token,
            expires_in: token.expires_in,
            timestamp: token.timestamp || Date.now(),
            enable: token.enable !== false
          });
          addedCount++;
        }
      }

      // 保存账号
      await saveAccounts(accounts);

      // 清理上传的文件
      try {
        await fs.unlink(filePath);
      } catch (e) {
        logger.warn('清理上传文件失败:', e);
      }

      logger.info(`成功导入 ${addedCount} 个 Token 账号`);
      return {
        success: true,
        count: addedCount,
        total: importedTokens.length,
        skipped: importedTokens.length - addedCount,
        message: `成功导入 ${addedCount} 个 Token 账号${importedTokens.length - addedCount > 0 ? `，跳过 ${importedTokens.length - addedCount} 个重复账号` : ''}`
      };
    }
  } catch (error) {
    logger.error('导入 Token 失败:', error);
    // 清理上传的文件
    try {
      await fs.unlink(filePath);
    } catch (e) {}
    throw error;
  }
}
