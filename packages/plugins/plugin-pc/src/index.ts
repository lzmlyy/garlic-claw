import type { PluginCapability } from '@garlic-claw/shared';
import { DEVICE_TYPE, PluginClient } from '@garlic-claw/plugin-sdk/client';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

/**
 * 输出插件运行日志到标准输出。
 * @param message 完整日志文本
 * @returns 无返回值
 */
function writePluginPcLog(message: string): void {
  process.stdout.write(`${message}\n`);
}

// --- 配置 ---
const SERVER_URL = process.env.WS_URL ?? 'ws://localhost:23331';
const TOKEN = process.env.PLUGIN_TOKEN ?? '';

if (!TOKEN) {
  process.stderr.write('错误：PLUGIN_TOKEN 环境变量是必需的。\n');
  process.stderr.write('从服务器获取 JWT 令牌（登录）并设置 PLUGIN_TOKEN=<token>\n');
  process.exit(1);
}

// --- 能力定义 ---
const capabilities: PluginCapability[] = [
  {
    name: 'get_pc_info',
    description: '获取此 PC 的详细信息（主机名、操作系统、CPU、内存、运行时间）',
    parameters: {},
  },
  {
    name: 'list_directory',
    description: '列出此 PC 上目录中的文件和文件夹',
    parameters: {
      dirPath: {
        type: 'string',
        description: '要列出的目录的绝对路径',
        required: true,
      },
    },
  },
  {
    name: 'read_text_file',
    description: '读取此 PC 上文本文件的内容（最大 10KB）',
    parameters: {
      filePath: {
        type: 'string',
        description: '要读取的文件的绝对路径',
        required: true,
      },
    },
  },
  {
    name: 'get_running_processes',
    description: '获取此 PC 上运行的进程列表（按内存排名前 30）',
    parameters: {},
  },
  {
    name: 'get_disk_usage',
    description: '获取此 PC 上所有驱动器的磁盘使用情况',
    parameters: {},
  },
];

// --- 创建并连接客户端 ---
const client = new PluginClient({
  serverUrl: SERVER_URL,
  token: TOKEN,
  pluginName: `pc-${os.hostname()}`,
  deviceType: DEVICE_TYPE.PC,
  manifest: {
    name: '电脑助手',
    version: '1.0.0',
    description: '暴露当前电脑的文件、系统信息与进程能力。',
    permissions: [],
    tools: capabilities,
    hooks: [],
  },
});

// --- 注册命令处理器 ---

client.onCommand('get_pc_info', async () => {
  const cpus = os.cpus();
  return {
    hostname: os.hostname(),
    platform: os.platform(),
    arch: os.arch(),
    release: os.release(),
    cpuModel: cpus[0]?.model ?? 'unavailable',
    cpuCores: cpus.length,
    totalMemoryGB: (os.totalmem() / 1024 / 1024 / 1024).toFixed(2),
    freeMemoryGB: (os.freemem() / 1024 / 1024 / 1024).toFixed(2),
    uptimeHours: (os.uptime() / 3600).toFixed(2),
    userInfo: os.userInfo().username,
  };
});

client.onCommand('list_directory', async (params) => {
  const dirPath = params.dirPath as string;
  if (!dirPath || !path.isAbsolute(dirPath)) {
    throw new Error('dirPath 必须是绝对路径');
  }

  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  return entries.slice(0, 100).map((e) => {
    const size = e.isFile()
      ? fs.statSync(path.join(dirPath, e.name)).size
      : null;

    return {
      name: e.name,
      type: e.isDirectory() ? 'directory' : e.isFile() ? 'file' : 'other',
      size,
    };
  });
});

client.onCommand('read_text_file', async (params) => {
  const filePath = params.filePath as string;
  if (!filePath || !path.isAbsolute(filePath)) {
    throw new Error('filePath 必须是绝对路径');
  }

  const stat = fs.statSync(filePath);
  if (stat.size > 10240) {
    throw new Error('文件过大（最大 10KB）');
  }

  return { content: fs.readFileSync(filePath, 'utf-8') };
});

client.onCommand('get_running_processes', async () => {
  try {
    if (os.platform() === 'win32') {
      const raw = execSync(
        'powershell -Command "Get-Process | Sort-Object WorkingSet64 -Descending | Select-Object -First 30 Name, Id, @{N=\'MemMB\';E={[math]::Round($_.WorkingSet64/1MB,1)}} | ConvertTo-Json"',
        { timeout: 10000 },
      ).toString();
      return JSON.parse(raw);
    }
    const raw = execSync('ps aux --sort=-%mem | head -31', { timeout: 10000 }).toString();
    return { raw };
  } catch (e) {
    throw new Error(
      `获取进程失败：${e instanceof Error ? e.message : e}`,
      { cause: e },
    );
  }
});

client.onCommand('get_disk_usage', async () => {
  try {
    if (os.platform() === 'win32') {
      const raw = execSync(
        'powershell -Command "Get-PSDrive -PSProvider FileSystem | Select-Object Name, @{N=\'UsedGB\';E={[math]::Round($_.Used/1GB,2)}}, @{N=\'FreeGB\';E={[math]::Round($_.Free/1GB,2)}} | ConvertTo-Json"',
        { timeout: 10000 },
      ).toString();
      return JSON.parse(raw);
    }
    const raw = execSync('df -h', { timeout: 10000 }).toString();
    return { raw };
  } catch (e) {
    throw new Error(
      `获取磁盘使用失败：${e instanceof Error ? e.message : e}`,
      { cause: e },
    );
  }
});

// --- 启动 ---
writePluginPcLog(`[plugin-pc] 正在启动 PC 插件，主机名：${os.hostname()}`);
writePluginPcLog(`[plugin-pc] 正在连接到 ${SERVER_URL}...`);
client.connect();

// 优雅关闭
process.on('SIGINT', () => {
  writePluginPcLog('[plugin-pc] 正在关闭...');
  client.disconnect();
  process.exit(0);
});
