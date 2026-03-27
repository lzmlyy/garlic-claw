/**
 * 聊天图片上传压缩工具
 *
 * 输入:
 * - 浏览器中的图片文件
 * - 目标 data URL 大小预算
 *
 * 输出:
 * - 可安全放进聊天 JSON 请求体的压缩图片
 *
 * 预期行为:
 * - 优先在前端把图片压缩到预算内
 * - 压缩失败或仍然过大时明确报错
 */

/**
 * 单张图片允许占用的最大 data URL 字节数。
 */
export const MAX_CHAT_IMAGE_DATA_URL_BYTES = 48 * 1024;

/**
 * 单次聊天请求中所有图片允许占用的最大 data URL 字节数。
 */
export const MAX_CHAT_TOTAL_IMAGE_DATA_URL_BYTES = 72 * 1024;

/**
 * 单张图片的最低可接受预算。
 */
export const MIN_CHAT_IMAGE_DATA_URL_BYTES = 16 * 1024;

/**
 * 压缩后的上传结果。
 */
export interface PreparedChatImageUpload {
  /** 可直接发送给后端的图片 data URL。 */
  image: string;
  /** 实际使用的 MIME 类型。 */
  mimeType: string;
  /** 原始 data URL 字节数。 */
  originalBytes: number;
  /** 压缩后 data URL 字节数。 */
  compressedBytes: number;
  /** 是否发生了压缩。 */
  compressed: boolean;
}

/**
 * 将图片压缩到聊天上传预算内。
 * @param file 浏览器图片文件
 * @param targetBytes 目标 data URL 字节数
 * @returns 可上传的图片结果
 */
export async function prepareChatImageUpload(
  file: File,
  targetBytes: number,
): Promise<PreparedChatImageUpload> {
  const sourceDataUrl = await readFileAsDataUrl(file);
  const originalBytes = measureDataUrlBytes(sourceDataUrl);
  if (originalBytes <= targetBytes) {
    return {
      image: sourceDataUrl,
      mimeType: file.type || inferMimeType(sourceDataUrl),
      originalBytes,
      compressedBytes: originalBytes,
      compressed: false,
    };
  }

  const imageElement = await loadImageElement(sourceDataUrl);
  const bestCandidate = await compressToBudget(imageElement, targetBytes);

  if (!bestCandidate) {
    throw new Error(`压缩后仍然超过 ${formatBytes(targetBytes)}，请换更小的图片`);
  }

  return {
    image: bestCandidate.dataUrl,
    mimeType: bestCandidate.mimeType,
    originalBytes,
    compressedBytes: bestCandidate.bytes,
    compressed: true,
  };
}

/**
 * 格式化字节大小。
 * @param bytes 原始字节数
 * @returns 可读文本
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  const kb = bytes / 1024;
  if (kb < 1024) {
    return `${kb.toFixed(kb >= 100 ? 0 : 1)} KB`;
  }

  const mb = kb / 1024;
  return `${mb.toFixed(mb >= 100 ? 0 : 1)} MB`;
}

/**
 * 计算 data URL 近似字节数。
 * @param dataUrl 图片 data URL
 * @returns 字节数
 */
export function measureDataUrlBytes(dataUrl: string): number {
  return new Blob([dataUrl]).size;
}

/**
 * 读取文件为 data URL。
 * @param file 浏览器文件对象
 * @returns data URL
 */
function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('读取图片失败'));
    reader.readAsDataURL(file);
  });
}

/**
 * 把 data URL 加载为浏览器图片对象。
 * @param dataUrl 图片 data URL
 * @returns 已加载的图片元素
 */
function loadImageElement(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('加载图片失败'));
    image.src = dataUrl;
  });
}

/**
 * 在多个尺寸和质量组合中寻找满足预算的压缩结果。
 * @param imageElement 已加载的图片元素
 * @param targetBytes 目标预算
 * @returns 压缩结果；找不到时返回 null
 */
async function compressToBudget(
  imageElement: HTMLImageElement,
  targetBytes: number,
): Promise<{ dataUrl: string; bytes: number; mimeType: string } | null> {
  const dimensionSteps = [1280, 1024, 896, 768, 640, 512, 384, 320];
  const qualitySteps = [0.82, 0.72, 0.62, 0.52, 0.42, 0.32];
  let bestCandidate: { dataUrl: string; bytes: number; mimeType: string } | null = null;

  for (const maxSide of dimensionSteps) {
    const { width, height } = scaleToFit(
      imageElement.naturalWidth,
      imageElement.naturalHeight,
      maxSide,
    );
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('浏览器不支持图片压缩');
    }

    context.drawImage(imageElement, 0, 0, width, height);

    for (const quality of qualitySteps) {
      const dataUrl = canvas.toDataURL('image/webp', quality);
      const bytes = measureDataUrlBytes(dataUrl);
      if (!bestCandidate || bytes < bestCandidate.bytes) {
        bestCandidate = {
          dataUrl,
          bytes,
          mimeType: 'image/webp',
        };
      }

      if (bytes <= targetBytes) {
        return {
          dataUrl,
          bytes,
          mimeType: 'image/webp',
        };
      }
    }
  }

  if (bestCandidate && bestCandidate.bytes <= targetBytes) {
    return bestCandidate;
  }

  return null;
}

/**
 * 将图片尺寸按比例缩放到指定上限。
 * @param width 原始宽度
 * @param height 原始高度
 * @param maxSide 最大边长
 * @returns 缩放后的宽高
 */
function scaleToFit(
  width: number,
  height: number,
  maxSide: number,
): { width: number; height: number } {
  const longestSide = Math.max(width, height);
  if (longestSide <= maxSide) {
    return { width, height };
  }

  const ratio = maxSide / longestSide;
  return {
    width: Math.max(1, Math.round(width * ratio)),
    height: Math.max(1, Math.round(height * ratio)),
  };
}

/**
 * 从 data URL 推断 MIME 类型。
 * @param dataUrl 图片 data URL
 * @returns MIME 类型
 */
function inferMimeType(dataUrl: string): string {
  const matched = /^data:([^;]+);/u.exec(dataUrl);
  return matched?.[1] ?? 'image/png';
}
